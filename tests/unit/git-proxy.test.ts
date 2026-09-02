import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitProxy } from "@/core/git/git-proxy";

describe("GitProxy", () => {
  let tempDir: string;
  let store: ConfigStore;
  let proxy: GitProxy;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-proxy-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const paths = new PathResolver(path.join(tempDir, ".gitbridge"));
    store = new ConfigStore(paths);
    proxy = new GitProxy(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("correctly parses git arguments and flags", () => {
    const res1 = proxy.parseGitArgs(["commit", "-m", "Initial commit"]);
    expect(res1.subcommand).toBe("commit");
    expect(res1.cwd).toBe(process.cwd());

    const res2 = proxy.parseGitArgs(["-C", "/custom/path", "status"]);
    expect(res2.subcommand).toBe("status");
    expect(res2.cwd).toBe(path.resolve("/custom/path"));

    const res3 = proxy.parseGitArgs(["-C/another/path", "push", "origin", "main"]);
    expect(res3.subcommand).toBe("push");
    expect(res3.cwd).toBe(path.resolve("/another/path"));

    const res4 = proxy.parseGitArgs(["--git-dir=/some/git", "log", "-n", "10"]);
    expect(res4.subcommand).toBe("log");
  });

  it("handles basic git commands via proxy execution", async () => {
    // Run real git --version via proxy
    const exitCode = await proxy.execute(["--version"]);
    expect(exitCode).toBe(0);
  });
});
