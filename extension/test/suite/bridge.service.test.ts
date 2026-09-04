import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "../../../src/core/config/config-store";
import { PathResolver } from "../../../src/core/config/path-resolver";
import { GitCli } from "../../../src/core/git/git-cli";
import { BridgeService } from "../../src/services/bridge.service";

describe("Extension BridgeService", () => {
  let tempDir: string;
  let store: ConfigStore;
  let bridge: BridgeService;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-ext-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    bridge = new BridgeService(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads identities, accounts, rules and resolves context", async () => {
    bridge.getStore().addIdentity({
      id: "personal",
      name: "Fuad Personal",
      email: "personal@example.com",
    });

    const identities = bridge.loadIdentities();
    expect(identities.length).toBe(1);
    expect(identities[0].id).toBe("personal");

    const ctx = await bridge.resolveContext(tempDir);
    expect(ctx.source).toBe("global_default");
    expect(ctx.identity?.id).toBe("personal");
  });

  it("adds and switches identities via bridge", async () => {
    await bridge.addIdentity({
      id: "work",
      name: "Fuad Work",
      email: "work@company.com",
      isDefault: false,
    });

    let identities = bridge.loadIdentities();
    expect(identities.length).toBe(1);

    await bridge.setIdentity("work", undefined, true);
    expect(bridge.loadConfig().defaultIdentityId).toBe("work");
  });

  it("manages override and IDE sync state via bridge", () => {
    const overrideStatusBefore = bridge.getOverrideStatus();
    expect(overrideStatusBefore.enabled).toBe(false);

    bridge.enableOverride();
    const overrideStatusAfter = bridge.getOverrideStatus();
    expect(overrideStatusAfter.enabled).toBe(true);
    expect(overrideStatusAfter.shimsInstalled).toBe(true);

    const ideStatus = bridge.getIdeStatus();
    expect(ideStatus.length).toBeGreaterThan(0);

    bridge.disableOverride();
    expect(bridge.getOverrideStatus().enabled).toBe(false);
  });

  it("manages rules, accounts, providers, and integrations via bridge", async () => {
    // 1. Rules
    await bridge.addRule({
      id: "rule_1",
      path: path.join(tempDir, "work"),
      identityId: "work",
    });
    expect(bridge.loadRules().length).toBe(1);

    await bridge.removeRule("rule_1");
    expect(bridge.loadRules().length).toBe(0);

    // 2. Accounts
    bridge.getStore().addAccount({
      id: "gh_acc",
      providerId: "github",
      host: "github.com",
      username: "ghuser",
      authType: "pat",
    });
    expect(bridge.loadAccounts().length).toBe(1);
    await bridge.removeAccount("gh_acc");
    expect(bridge.loadAccounts().length).toBe(0);

    // 3. Providers
    const providers = bridge.listProviders();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers.some((p) => p.providerId === "github")).toBe(true);

    bridge.enableProvider("gitlab");
    bridge.disableProvider("gitlab");

    // 4. Injections & status
    await bridge.enable();
    await bridge.disable();
    expect(bridge.isGitInstalled()).toBe(false);
    expect(bridge.isSshInstalled()).toBe(false);

    // 5. Diagnostics
    const diag = await bridge.runDiagnostics();
    expect(diag).toBeDefined();
    expect(typeof diag).toBe("string");
    expect(diag).toContain("Git CLI Version");

    // 6. Repositories & Identities
    expect(bridge.loadRepositories()).toBeDefined();
    await bridge.removeIdentity("work");

    // 7. Safety Hooks in testRepo
    const testRepo = path.join(tempDir, "test-repo");
    fs.mkdirSync(testRepo, { recursive: true });
    const git = new GitCli(testRepo);
    await git.exec(["init"]);

    const isInstalled = await bridge.isSafetyHookInstalled(testRepo);
    expect(isInstalled).toBe(false);
    const installed = await bridge.installSafetyHook(testRepo);
    expect(installed).toBe(true);
    expect(await bridge.isSafetyHookInstalled(testRepo)).toBe(true);
    await bridge.uninstallSafetyHook(testRepo);
    expect(await bridge.isSafetyHookInstalled(testRepo)).toBe(false);

    // 8. Fix Email Mismatch
    const fixNonRepo = await bridge.fixEmailMismatch(tempDir);
    expect(fixNonRepo.success).toBe(false);

    // 9. GitBridge injection toggle
    const enabledState = bridge.enableGitBridge();
    expect(enabledState).toBeDefined();
    bridge.disableGitBridge();

    // 10. IDE Unsync
    expect(() => bridge.unsyncIde()).not.toThrow();

    // 11. pushAll error handling
    expect(bridge.pushAll(testRepo)).rejects.toThrow();
  });
});
