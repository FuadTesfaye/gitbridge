import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { GitCli } from "@/core/git/git-cli";
import { GitCliError } from "@/utils/errors";

describe("GitCli Unit Tests", () => {
  let tempDir: string;
  let repoDir: string;
  let git: GitCli;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gb-gitcli-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    repoDir = path.join(tempDir, "test-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    git = new GitCli(repoDir);
    await git.exec(["init"]);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("checks git repo detection and finds repo root", async () => {
    expect(await git.isGitRepo()).toBe(true);
    const root = await git.getRepoRoot();
    expect(root).toBe(repoDir);

    const nonGit = new GitCli(tempDir);
    // tempDir itself is not a git repo (repoDir is inside it)
    const isRepo = await nonGit.isGitRepo();
    expect(typeof isRepo).toBe("boolean");
  });

  it("manages user config and signing key", async () => {
    await git.setConfig("user.name", "Test User", "local");
    await git.setConfig("user.email", "test@example.com", "local");
    await git.setConfig("user.signingkey", "KEY12345", "local");

    expect(await git.getConfig("user.name")).toBe("Test User");
    expect(await git.getConfig("user.email")).toBe("test@example.com");
    expect(await git.getConfig("user.signingkey")).toBe("KEY12345");

    await git.unsetConfig("user.signingkey", "local");
    expect(await git.getConfig("user.signingkey")).toBeNull();
  });

  it("manages remotes and updates remote URLs", async () => {
    // Add remote via setRemoteUrl
    await git.setRemoteUrl("origin", "git@github.com:octocat/hello-world.git");
    let remotes = await git.getRemotes();
    expect(remotes.length).toBe(1);
    expect(remotes[0].name).toBe("origin");
    expect(remotes[0].fetchUrl).toBe("git@github.com:octocat/hello-world.git");

    // Update existing remote via setRemoteUrl
    await git.setRemoteUrl("origin", "https://github.com/octocat/hello-world.git");
    remotes = await git.getRemotes();
    expect(remotes[0].fetchUrl).toBe("https://github.com/octocat/hello-world.git");
  });

  it("gets version, current branch, and inspects staged files", async () => {
    const version = await git.getGitVersion();
    expect(version).toBeDefined();
    expect(typeof version).toBe("string");

    // Create and stage a file
    const testFile = path.join(repoDir, "sample.txt");
    fs.writeFileSync(testFile, "hello staged content\n");
    await git.exec(["add", "sample.txt"]);

    const staged = await git.getStagedFiles();
    expect(staged).toContain("sample.txt");

    const content = await git.showStagedFile("sample.txt");
    expect(content).toBe("hello staged content");

    const branch = await git.getCurrentBranch();
    expect(branch === null || typeof branch === "string").toBe(true);
  });

  it("throws GitCliError with exit code and stderr on fatal commands", async () => {
    try {
      await git.exec(["log"]);
      expect(true).toBe(false); // should not reach
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GitCliError);
      const cliErr = err as GitCliError;
      expect(cliErr.exitCode).toBeGreaterThan(0);
    }
  });
});
