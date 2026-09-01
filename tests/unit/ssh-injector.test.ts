import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { SshInjector, SSH_BLOCK_START, SSH_BLOCK_END } from "@/core/ssh/ssh-injector";

describe("SshInjector", () => {
  let tempDir: string;
  let store: ConfigStore;
  let testSshConfig: string;
  let injector: SshInjector;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-ssh-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    testSshConfig = path.join(tempDir, "config");
    fs.writeFileSync(testSshConfig, "Host legacy\n    HostName legacy.example.com\n");

    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    injector = new SshInjector(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("injects GitBridge Include directive at the top of ssh config", () => {
    store.addAccount({
      id: "gh_work",
      providerId: "github",
      host: "github.com",
      username: "fuad-corp",
      authType: "oauth",
      sshKeyPath: "~/.ssh/id_ed25519_work",
    });

    const { success, backupPath } = injector.inject(testSshConfig);
    expect(success).toBe(true);
    expect(backupPath).not.toBeNull();
    expect(injector.isInstalled(testSshConfig)).toBe(true);

    const content = fs.readFileSync(testSshConfig, "utf-8");
    expect(content).toContain(SSH_BLOCK_START);
    expect(content).toContain(SSH_BLOCK_END);
    expect(content).toContain("Include");
    expect(content).toContain("Host legacy");
  });

  it("removes GitBridge Include cleanly on disable", () => {
    store.addAccount({
      id: "gh_work",
      providerId: "github",
      host: "github.com",
      username: "fuad-corp",
      authType: "oauth",
      sshKeyPath: "~/.ssh/id_ed25519_work",
    });

    injector.inject(testSshConfig);
    expect(injector.isInstalled(testSshConfig)).toBe(true);

    const removed = injector.remove(testSshConfig);
    expect(removed).toBe(true);
    expect(injector.isInstalled(testSshConfig)).toBe(false);

    const content = fs.readFileSync(testSshConfig, "utf-8");
    expect(content).toContain("Host legacy");
    expect(content).not.toContain(SSH_BLOCK_START);
  });
});
