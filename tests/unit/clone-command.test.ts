import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { handleCloneCommand } from "@/cli/commands/clone";
import { GitCli } from "@/core/git/git-cli";

describe("Clone Command Unit Tests", () => {
  let tempDir: string;
  let store: ConfigStore;
  let paths: PathResolver;
  let remoteRepoDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gb-clone-unit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    remoteRepoDir = path.join(tempDir, "remote.git");
    fs.mkdirSync(tempDir, { recursive: true });

    paths = new PathResolver(path.join(tempDir, ".gitbridge"));
    store = new ConfigStore(paths);

    // Create bare remote repo
    const git = new GitCli(tempDir);
    await git.exec(["init", "--bare", remoteRepoDir]);

    // Populate store
    store.addIdentity({
      id: "personal",
      name: "Fuad Personal",
      email: "fuad@personal.me",
      isDefault: true,
    });
    store.addAccount({
      id: "gh_personal",
      providerId: "github",
      host: "github.com",
      username: "fuadpersonal",
      authType: "pat",
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("handles empty or whitespace url gracefully", async () => {
    // Should log error and return without throwing
    await handleCloneCommand("", undefined, {}, store);
    await handleCloneCommand("   ", undefined, {}, store);
  });

  it("clones local repository and sets context with explicit flags", async () => {
    const dest = path.join(tempDir, "cloned-repo");
    await handleCloneCommand(
      remoteRepoDir,
      dest,
      { identity: "personal", account: "gh_personal" },
      store
    );

    expect(fs.existsSync(dest)).toBe(true);
    const git = new GitCli(dest);
    expect(await git.isGitRepo()).toBe(true);

    const saved = store.getRepository(dest);
    expect(saved).toBeDefined();
    expect(saved?.identityId).toBe("personal");
  });

  it("handles fallback to default identity when no options given", async () => {
    const dest = path.join(tempDir, "cloned-default");
    await handleCloneCommand(remoteRepoDir, dest, {}, store);

    expect(fs.existsSync(dest)).toBe(true);
    const saved = store.getRepository(dest);
    expect(saved).toBeDefined();
    expect(saved?.identityId).toBe("personal");
  });
});
