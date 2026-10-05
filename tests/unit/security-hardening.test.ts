import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { hostsEqual, detectCloudProviderFromHost, normalizeHost } from "@/utils/hosts";
import { redactRemoteUrl, isSafeSshHostToken, isSafeGitExecutablePath } from "@/utils/security";
import { parseJsonc } from "@/utils/jsonc";
import { replaceManagedBlock, removeManagedBlock } from "@/utils/managed-block";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitCredentialHelperHandler } from "@/cli/commands/credential";
import { StoreFactory } from "@/core/storage/store-factory";
import { GitConfigGenerator } from "@/core/git/config-generator";
import { EncryptedVaultCredentialStore } from "@/core/storage/encrypted-vault";
import { parseRemoteUrl } from "@/core/git/url-parser";
import { RepoAccessDetector } from "@/core/providers/repo-access-detector";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";

describe("Security hardening", () => {
  it("does not treat github.com.attacker as GitHub", () => {
    expect(detectCloudProviderFromHost("github.com.evil.com")).toBeNull();
    expect(hostsEqual("github.com", "github.com.evil.com")).toBe(false);
    expect(parseRemoteUrl("https://github.com.evil.com/user/repo.git")?.providerId).not.toBe("github");
  });

  it("matches exact hosts and real subdomains only", () => {
    expect(normalizeHost("https://GitHub.COM/foo")).toBe("github.com");
    expect(hostsEqual("github.com", "GitHub.COM")).toBe(true);
    expect(detectCloudProviderFromHost("gist.github.com")).toBe("github");
    expect(detectCloudProviderFromHost("notgithub.com")).toBeNull();
  });

  it("redacts credentials in remote URLs", () => {
    expect(redactRemoteUrl("https://alice:ghp_secret@github.com/org/repo.git")).toBe(
      "https://alice:********@github.com/org/repo.git"
    );
  });

  it("rejects unsafe SSH host tokens and git paths", () => {
    expect(isSafeSshHostToken("github.com-work")).toBe(true);
    expect(isSafeSshHostToken("github.com-work *")).toBe(false);
    expect(isSafeGitExecutablePath("/usr/bin/git")).toBe(true);
    expect(isSafeGitExecutablePath("/tmp/x$(id)/git")).toBe(false);
  });

  it("parses JSONC and refuses invalid editor settings", () => {
    const parsed = parseJsonc(`{
      // comment
      "editor.fontSize": 14,
    }`);
    expect(parsed?.["editor.fontSize"]).toBe(14);
    expect(parseJsonc("{ definitely not json")).toBeNull();
  });

  it("refuses unpaired managed-block rewrites", () => {
    const original = "keep me\n# --- BEGIN X ---\npartial";
    const result = replaceManagedBlock(original, "# --- BEGIN X ---", "# --- END X ---", "new");
    expect(result.ok).toBe(false);
    expect(removeManagedBlock(original, "# --- BEGIN X ---", "# --- END X ---").ok).toBe(false);
  });
});

describe("Credential helper host isolation", () => {
  let tempDir: string;
  let store: ConfigStore;
  let handler: GitCredentialHelperHandler;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gb-cred-iso-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    handler = new GitCredentialHelperHandler(store);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not return a GitHub PAT for a different host", async () => {
    store.addAccount({
      id: "github_alice",
      providerId: "github",
      host: "github.com",
      username: "alice",
      authType: "pat",
    });
    store.addRule({
      id: "work",
      path: tempDir,
      identityId: "missing",
      defaultAccountId: "github_alice",
    });
    store.addIdentity({ id: "missing", name: "Alice", email: "alice@example.com" });

    const credStore = await StoreFactory.getStore(store.getPathResolver(), true);
    await credStore.set("github.com", "github_alice", "ghp_should_not_leak");

    const output = await handler.handleGet("protocol=https\nhost=evil.example\nusername=alice\n", tempDir);
    expect(output).toBe("");
    expect(output).not.toContain("ghp_should_not_leak");
  });

  it("emits a valid git credential.helper shell snippet", () => {
    store.addIdentity({ id: "personal", name: "A", email: "a@example.com", isDefault: true });
    const generator = new GitConfigGenerator(store);
    const { mainConfigPath } = generator.generate();
    const content = fs.readFileSync(mainConfigPath, "utf-8");
    expect(content).toContain("helper = !gitbridge credential");
    expect(content).not.toContain("helper = gitbridge credential\n");
  });
});

describe("Vault integrity", () => {
  it("refuses to overwrite a corrupt vault", async () => {
    const tempDir = path.join(os.tmpdir(), `gb-vault-corrupt-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      const paths = new PathResolver(tempDir);
      const vault = new EncryptedVaultCredentialStore(paths);
      await vault.set("github.com", "user", "token");
      fs.writeFileSync(paths.getEncryptedVaultFile(), Buffer.alloc(64, 7));
      await expect(vault.set("github.com", "user2", "other")).rejects.toThrow(/cannot be decrypted|corrupt/i);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Public-repo access is not ownership", () => {
  it("does not bind the first PAT that can only read a public repo", async () => {
    const tempDir = path.join(os.tmpdir(), `gb-pub-access-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      const paths = new PathResolver(tempDir);
      const store = new ConfigStore(paths);
      store.addIdentity({ id: "id_alice", name: "Alice", email: "alice@org.com" });
      store.addAccount({
        id: "github_alice",
        providerId: "github",
        host: "github.com",
        username: "alice",
        email: "alice@org.com",
        identityId: "id_alice",
        authType: "pat",
      });
      store.addAccount({
        id: "github_bob",
        providerId: "github",
        host: "github.com",
        username: "bob",
        email: "bob@org.com",
        authType: "pat",
      });
      const credStore = await StoreFactory.getStore(paths, true);
      await credStore.set("github.com", "github_alice", "token_alice");
      await credStore.set("github.com", "github_bob", "token_bob");

      const github = defaultProviderRegistry.get("github");
      const original = github?.checkRepoAccess;
      if (github) {
        github.checkRepoAccess = async () => ({ hasAccess: true, permission: "read" });
      }
      try {
        const detector = new RepoAccessDetector(store);
        const result = await detector.detectAccess({
          url: "https://github.com/torvalds/linux.git",
          targetPath: tempDir,
          allowNetwork: true,
        });
        expect(result.matched).toBe(false);
      } finally {
        if (github && original) github.checkRepoAccess = original;
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
