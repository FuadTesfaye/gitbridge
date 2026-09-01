import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { IdentityGuard } from "@/core/safety/identity-guard";

describe("IdentityGuard", () => {
  let tempDir: string;
  let store: ConfigStore;
  let guard: IdentityGuard;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-guard-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    guard = new IdentityGuard(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("installs and uninstalls pre-commit hook into a mock git repo", async () => {
    const mockRepo = path.join(tempDir, "my-repo");
    fs.mkdirSync(path.join(mockRepo, ".git", "hooks"), { recursive: true });

    // Mock git repo
    const proc = Bun.spawn(["git", "init"], { cwd: mockRepo });
    await proc.exited;

    const installed = await guard.installPreCommitHook(mockRepo);
    expect(installed).toBe(true);

    const hookFile = path.join(mockRepo, ".git", "hooks", "pre-commit");
    expect(fs.existsSync(hookFile)).toBe(true);
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).toContain("GitBridge Pre-Commit Identity Guard");

    const uninstalled = await guard.uninstallPreCommitHook(mockRepo);
    expect(uninstalled).toBe(true);
    expect(fs.existsSync(hookFile)).toBe(false);
  });
});
