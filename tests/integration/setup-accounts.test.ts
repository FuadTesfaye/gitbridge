import { afterEach, beforeEach, describe, expect, it, spyOn, mock } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as prompts from "@clack/prompts";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";
import { StoreFactory } from "@/core/storage/store-factory";
import { EncryptedVaultCredentialStore } from "@/core/storage/encrypted-vault";
import { handleSetupCommand } from "@/cli/commands/setup";
import { handleAuthLogin, handleAuthLogout } from "@/cli/commands/auth";
import { GitCredentialHelperHandler } from "@/cli/commands/credential";
import { BridgeService } from "../../extension/src/services/bridge.service";

describe("Setup account onboarding and persistent credentials", () => {
  let root: string;
  let store: ConfigStore;
  let vault: EncryptedVaultCredentialStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gb-setup-accounts-"));
    const home = path.join(root, "home");
    fs.mkdirSync(home);
    store = new ConfigStore(new PathResolver(path.join(root, "config"), home));
    vault = new EncryptedVaultCredentialStore(store.getPathResolver());
    spyOn(StoreFactory, "getStore").mockResolvedValue(vault);
    for (const id of ["github", "gitlab", "bitbucket"]) {
      spyOn(defaultProviderRegistry.get(id)!, "getUser").mockImplementation(async (token) => {
        if (token === "invalid") throw new Error("Invalid credentials");
        const username = token.replace("test-token-", "");
        return { id: username, username, displayName: username, email: `${username}@example.com` };
      });
    }
  });

  afterEach(() => {
    mock.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("adds any number of accounts with just username and masked token, then remembers them on rerun", async () => {
    store.addIdentity({ id: "personal", name: "Tester", email: "tester@example.com" });
    spyOn(prompts, "multiselect").mockResolvedValue(["github"]);
    const names = ["alice", "bob", "carol"];
    const text = spyOn(prompts, "text");
    const password = spyOn(prompts, "password");
    for (const name of names) {
      text.mockResolvedValueOnce(name);
      password.mockResolvedValueOnce(`test-token-${name}`);
    }
    // Connect, add two more, done, skip identity edit, skip directory rule.
    const confirm = spyOn(prompts, "confirm");
    for (const answer of [true, true, true, false, false, false]) confirm.mockResolvedValueOnce(answer);
    const select = spyOn(prompts, "select");
    await handleSetupCommand({}, store);
    expect(text).toHaveBeenCalledTimes(3);
    expect(password).toHaveBeenCalledTimes(3);
    expect(select).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledTimes(6);

    const reloaded = new ConfigStore(store.getPathResolver());
    expect(reloaded.loadAccounts().map((a) => a.username)).toEqual(names);
    expect(reloaded.loadAccounts().every((a) => a.authType === "pat")).toBe(true);
    const helper = new GitCredentialHelperHandler(reloaded);
    for (const name of names) {
      expect(await new EncryptedVaultCredentialStore(store.getPathResolver()).get("github.com", `github_${name}`))
        .toBe(`test-token-${name}`);
      expect(await helper.handleGet(`protocol=https\nhost=github.com\nusername=${name}\n`, root))
        .toContain(`password=test-token-${name}`);
    }
    expect(await helper.handleGet("protocol=https\nhost=github.com\n", root)).toBe("");
    expect(fs.readFileSync(store.getPathResolver().getAccountsFile(), "utf8")).not.toContain("test-token-");

    for (const answer of [false, false, false]) confirm.mockResolvedValueOnce(answer);
    await handleSetupCommand({}, reloaded);
    expect(text).toHaveBeenCalledTimes(3);
    expect(reloaded.loadAccounts()).toHaveLength(3);
  });

  it("offers retry after a failed setup login and saves only the successful account", async () => {
    store.addIdentity({ id: "personal", name: "Tester", email: "tester@example.com" });
    spyOn(prompts, "multiselect").mockResolvedValue(["github"]);
    spyOn(prompts, "text").mockResolvedValue("alice");
    spyOn(prompts, "password").mockResolvedValueOnce("invalid").mockResolvedValueOnce("test-token-alice");
    const confirm = spyOn(prompts, "confirm");
    for (const answer of [true, true, false, false, false]) confirm.mockResolvedValueOnce(answer);
    await handleSetupCommand({}, store);
    expect(store.loadAccounts().map((a) => a.username)).toEqual(["alice"]);
    expect(confirm.mock.calls[1][0].message).toContain("again");
  });

  it("rejects mismatched or invalid tokens without replacing remembered credentials", async () => {
    const options = { username: "alice", token: "test-token-alice", skipSsh: true };
    expect(await handleAuthLogin("github", options, store)).toBe(true);
    expect(await handleAuthLogin("github", { ...options, token: "test-token-bob" }, store)).toBe(false);
    expect(await handleAuthLogin("github", { ...options, token: "invalid" }, store)).toBe(false);
    expect(store.loadAccounts()).toHaveLength(1);
    expect(await vault.get("github.com", "github_alice")).toBe("test-token-alice");
  });

  it("keeps hosts and providers separate, preserves SSH on reconnect, and removes one account on logout", async () => {
    for (const provider of ["github", "gitlab", "bitbucket"]) {
      expect(await handleAuthLogin(provider, { username: "Alice", token: "test-token-alice", skipSsh: true }, store)).toBe(true);
    }
    expect(await handleAuthLogin("gitlab", { username: "alice", token: "test-token-alice", host: "gitlab.example.com", skipSsh: true }, store)).toBe(true);
    store.addAccount({ ...store.getAccount("github_alice")!, sshKeyPath: path.join(root, "key") });
    expect(await handleAuthLogin("github", { username: "alice", token: "test-token-alice", skipSsh: true }, store)).toBe(true);
    expect(store.loadAccounts()).toHaveLength(4);
    expect(store.getAccount("github_alice")?.sshKeyPath).toBe(path.join(root, "key"));
    await handleAuthLogout("github", "alice", store);
    expect(await vault.get("github.com", "github_alice")).toBeNull();
    expect(store.loadAccounts()).toHaveLength(3);
    expect(await vault.get("gitlab.com", "gitlab_alice")).toBe("test-token-alice");
  });

  it("does not register accounts when secure credential storage fails", async () => {
    spyOn(vault, "set").mockRejectedValue(new Error("Storage unavailable"));
    expect(await handleAuthLogin("github", { username: "alice", token: "test-token-alice", skipSsh: true }, store)).toBe(false);
    expect(store.loadAccounts()).toHaveLength(0);
    await expect(new BridgeService(store).loginWithToken("github", "test-token-alice", undefined, "alice")).rejects.toThrow("Storage unavailable");
    expect(store.loadAccounts()).toHaveLength(0);
  });

  it("checks usernames and persists multiple accounts through the editor bridge too", async () => {
    const bridge = new BridgeService(store);
    await bridge.loginWithToken("github", "test-token-alice", undefined, "alice");
    await bridge.loginWithToken("github", "test-token-bob", undefined, "bob");
    await expect(bridge.loginWithToken("github", "test-token-bob", undefined, "alice")).rejects.toThrow("belongs to '@bob'");
    expect(new BridgeService(new ConfigStore(store.getPathResolver())).loadAccounts()).toHaveLength(2);
    expect(await vault.get("github.com", "github_alice")).toBe("test-token-alice");
  });

  it("preserves GitLab password login by email and restores HTTP opt-in after failure", async () => {
    const provider = defaultProviderRegistry.get("gitlab")!;
    spyOn(provider as import("@/core/providers/gitlab.provider").GitLabProvider, "loginWithPassword")
      .mockResolvedValueOnce({ token: "test-token-alice" })
      .mockRejectedValueOnce(new Error("Login rejected"));
    expect(await handleAuthLogin("gitlab", { username: "alice@example.com", password: "test-password", skipSsh: true }, store)).toBe(true);
    expect(store.getAccount("gitlab_alice")?.authType).toBe("password");
    const before = process.env.GITBRIDGE_ALLOW_HTTP;
    expect(await handleAuthLogin("gitlab", { username: "alice", password: "test-password", host: "http://localhost", insecureHttp: true }, store)).toBe(false);
    expect(process.env.GITBRIDGE_ALLOW_HTTP).toBe(before);
  });
});
