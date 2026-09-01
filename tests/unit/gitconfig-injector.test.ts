import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitConfigInjector, GITCONFIG_BLOCK_START, GITCONFIG_BLOCK_END } from "@/core/git/gitconfig-injector";

describe("GitConfigInjector", () => {
  let tempDir: string;
  let store: ConfigStore;
  let testGitConfig: string;
  let injector: GitConfigInjector;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-gitconfig-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    testGitConfig = path.join(tempDir, ".gitconfig");
    fs.writeFileSync(testGitConfig, "[core]\n    editor = vim\n");

    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    injector = new GitConfigInjector(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("injects GitBridge managed block into .gitconfig non-destructively", () => {
    store.addIdentity({ id: "personal", name: "Fuad", email: "p@example.com" });

    expect(injector.isInstalled(testGitConfig)).toBe(false);

    const { success, backupPath } = injector.inject(testGitConfig);
    expect(success).toBe(true);
    expect(backupPath).not.toBeNull();
    expect(injector.isInstalled(testGitConfig)).toBe(true);

    const content = fs.readFileSync(testGitConfig, "utf-8");
    expect(content).toContain("[core]");
    expect(content).toContain("editor = vim");
    expect(content).toContain(GITCONFIG_BLOCK_START);
    expect(content).toContain(GITCONFIG_BLOCK_END);
    expect(content).toContain("[include]");
  });

  it("removes managed block cleanly on disable", () => {
    store.addIdentity({ id: "personal", name: "Fuad", email: "p@example.com" });
    injector.inject(testGitConfig);
    expect(injector.isInstalled(testGitConfig)).toBe(true);

    const removed = injector.remove(testGitConfig);
    expect(removed).toBe(true);
    expect(injector.isInstalled(testGitConfig)).toBe(false);

    const content = fs.readFileSync(testGitConfig, "utf-8");
    expect(content).toContain("[core]");
    expect(content).toContain("editor = vim");
    expect(content).not.toContain(GITCONFIG_BLOCK_START);
  });
});
