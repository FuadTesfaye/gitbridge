import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitCli } from "@/core/git/git-cli";
import { handleRepoSet, handleRepoList, handleRepoUnset, handleRepoInit } from "@/cli/commands/repo";

describe("Repo Commands Unit Tests", () => {
  let tempDir: string;
  let repoDir: string;
  let store: ConfigStore;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gb-repo-cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    repoDir = path.join(tempDir, "my-repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const paths = new PathResolver(path.join(tempDir, ".gitbridge"));
    store = new ConfigStore(paths);

    // Initialize Git repository
    const git = new GitCli(repoDir);
    await git.exec(["init"]);
    await git.exec(["config", "user.name", "Initial"]);
    await git.exec(["config", "user.email", "initial@test.com"]);
    await git.exec(["remote", "add", "origin", "git@github.com:fuadt/my-repo.git"]);

    store.addIdentity({ id: "work", name: "Fuad Work", email: "fuad@work.com" });
    store.addAccount({
      id: "github_fuad",
      providerId: "github",
      host: "github.com",
      username: "fuadt",
      authType: "pat",
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("sets, lists, and unsets persistent repository profile cleanly", async () => {
    // 1. Set repo profile
    await handleRepoSet(repoDir, { identity: "work", account: "github_fuad", provider: "github" }, store);

    const saved = store.getRepository(repoDir);
    expect(saved).toBeDefined();
    expect(saved?.identityId).toBe("work");

    const localFile = path.join(repoDir, ".git", "gitbridge.json");
    expect(fs.existsSync(localFile)).toBe(true);

    // 2. List repo profiles
    await handleRepoList(store);

    // 3. Unset repo profile
    await handleRepoUnset(repoDir, store);
    expect(fs.existsSync(localFile)).toBe(false);
    expect(store.getRepository(repoDir)).toBeUndefined();
  });

  it("handles non-git repository path gracefully with error log", async () => {
    const nonGit = path.join(tempDir, "non-git");
    fs.mkdirSync(nonGit, { recursive: true });

    await handleRepoSet(nonGit, { identity: "work" }, store);
    expect(store.getRepository(nonGit)).toBeUndefined();
  });

  it("supports handleRepoInit helper", async () => {
    // Calling handleRepoInit with targetDir resolves matching directory rule cleanly without process.chdir
    store.addRule({
      id: "rule-repo",
      path: repoDir,
      identityId: "work",
    });

    await handleRepoInit(store, repoDir);
    expect(store.getRepository(repoDir)).toBeDefined();
    expect(store.getRepository(repoDir)?.identityId).toBe("work");
  });
});
