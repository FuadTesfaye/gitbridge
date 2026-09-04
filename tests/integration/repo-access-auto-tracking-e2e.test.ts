import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitCli } from "@/core/git/git-cli";
import { GitProxy } from "@/core/git/git-proxy";
import { GitOverrideManager } from "@/core/git/override-manager";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { RepoAccessDetector } from "@/core/providers/repo-access-detector";
import { handleCloneCommand } from "@/cli/commands/clone";

describe("🌟 Repo Access Auto-Tracking End-to-End Suite", () => {
  let tempDir: string;
  let gbHome: string;
  let bareRepoPath: string;
  let store: ConfigStore;
  let resolver: IdentityResolver;
  let detector: RepoAccessDetector;
  let proxy: GitProxy;
  let overrideManager: GitOverrideManager;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gb-access-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    gbHome = path.join(tempDir, ".gitbridge");
    fs.mkdirSync(gbHome, { recursive: true });

    const paths = new PathResolver(gbHome);
    store = new ConfigStore(paths);
    resolver = new IdentityResolver(store);
    detector = new RepoAccessDetector(store);
    proxy = new GitProxy(store);
    overrideManager = new GitOverrideManager(store);

    // Create a bare repository with an initial commit to clone from
    const seedDir = path.join(tempDir, "seed");
    fs.mkdirSync(seedDir, { recursive: true });
    const seedGit = new GitCli(seedDir);
    await seedGit.exec(["init"]);
    await seedGit.exec(["config", "user.name", "Seed Committer"]);
    await seedGit.exec(["config", "user.email", "seed@example.com"]);
    fs.writeFileSync(path.join(seedDir, "README.md"), "# Seed Repository");
    await seedGit.exec(["add", "."]);
    await seedGit.exec(["commit", "-m", "chore: seed initial commit"]);

    bareRepoPath = path.join(tempDir, "remote.git");
    await seedGit.exec(["clone", "--bare", seedDir, bareRepoPath]);

    // Setup two independent identities and accounts in GitBridge
    store.addIdentity({
      id: "personal",
      name: "Fuad Personal",
      email: "fuad@personal.me",
      isDefault: false,
    });
    store.addAccount({
      id: "github_fuadpersonal",
      providerId: "github",
      host: "github.com",
      username: "fuadpersonal",
      displayName: "Fuad Personal",
      email: "fuad@personal.me",
      identityId: "personal",
      authType: "pat",
    });

    store.addIdentity({
      id: "work",
      name: "Fuad WorkCorp",
      email: "fuad@workcorp.com",
      isDefault: false,
    });
    store.addAccount({
      id: "gitlab_fuadwork",
      providerId: "gitlab",
      host: "gitlab.workcorp.com",
      username: "fuadwork",
      displayName: "Fuad WorkCorp",
      email: "fuad@workcorp.com",
      identityId: "work",
      authType: "pat",
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("1. clones and auto-binds repository permanently using directory rule inheritance", async () => {
    // Mapped rule: everything in tempDir/work belongs to 'work' identity and gitlab account
    const workFolder = path.join(tempDir, "work");
    fs.mkdirSync(workFolder, { recursive: true });

    store.addRule({
      id: "work_folder_rule",
      path: workFolder,
      identityId: "work",
      defaultProvider: "gitlab",
      defaultAccountId: "gitlab_fuadwork",
    });

    const targetCloneDir = path.join(workFolder, "cloned-work-repo");

    // Execute smart clone
    await handleCloneCommand(bareRepoPath, targetCloneDir, {}, store);

    // Verify repository exists and git context is bound
    expect(fs.existsSync(targetCloneDir)).toBe(true);
    const localGitBridgeFile = path.join(targetCloneDir, ".git", "gitbridge.json");
    expect(fs.existsSync(localGitBridgeFile)).toBe(true);

    const localConfig = JSON.parse(fs.readFileSync(localGitBridgeFile, "utf-8"));
    expect(localConfig.identityId).toBe("work");
    expect(localConfig.accountId).toBe("gitlab_fuadwork");

    // Verify repos.json persistent registry (Tier 2)
    const registeredRepo = store.getRepository(targetCloneDir);
    expect(registeredRepo).toBeDefined();
    expect(registeredRepo?.identityId).toBe("work");

    // Verify git config user.name and user.email set in repo
    const clonedGit = new GitCli(targetCloneDir);
    expect(await clonedGit.getConfig("user.name")).toBe("Fuad WorkCorp");
    expect(await clonedGit.getConfig("user.email")).toBe("fuad@workcorp.com");

    // Verify resolution in that repository
    const ctx = await resolver.resolve(targetCloneDir);
    expect(ctx.source).toBe("repo_profile");
    expect(ctx.identity?.email).toBe("fuad@workcorp.com");
  });

  it("2. auto-detects account access for remote repo matching namespace and binds permanently", async () => {
    // Simulate cloning a project from GitHub: fuadpersonal/gitbridge
    const detected = await detector.detectAccess({
      url: "git@github.com:fuadpersonal/gitbridge.git",
      targetPath: tempDir,
    });

    expect(detected.matched).toBe(true);
    expect(detected.tier).toBe("namespace_match");
    expect(detected.accountId).toBe("github_fuadpersonal");
    expect(detected.identityId).toBe("personal");
    expect(detected.email).toBe("fuad@personal.me");

    // Now clone the local bare repository into a custom target dir, specifying the account/identity detected
    const cloneDest = path.join(tempDir, "auto-detected-repo");
    await handleCloneCommand(bareRepoPath, cloneDest, {
      identity: detected.identityId,
      account: detected.accountId,
    }, store);

    // Verify the repo is permanently locked to personal without asking again
    const localFile = path.join(cloneDest, ".git", "gitbridge.json");
    expect(fs.existsSync(localFile)).toBe(true);
    const localConfig = JSON.parse(fs.readFileSync(localFile, "utf-8"));
    expect(localConfig.identityId).toBe("personal");
    expect(localConfig.accountId).toBe("github_fuadpersonal");

    const clonedGit = new GitCli(cloneDest);
    expect(await clonedGit.getConfig("user.name")).toBe("Fuad Personal");
    expect(await clonedGit.getConfig("user.email")).toBe("fuad@personal.me");
  });

  it("3. resolves identity via Tier 4 Remote Access Detection on repositories with remote URLs", async () => {
    const unconfiguredRepoDir = path.join(tempDir, "unconfigured-repo");
    fs.mkdirSync(unconfiguredRepoDir, { recursive: true });

    const git = new GitCli(unconfiguredRepoDir);
    await git.exec(["init"]);
    // Set origin remote matching the work account namespace on gitlab.workcorp.com
    await git.exec(["remote", "add", "origin", "git@gitlab.workcorp.com:fuadwork/service-app.git"]);

    // No .git/gitbridge.json, no repos.json, no directory rules match
    const ctx = await resolver.resolve(unconfiguredRepoDir);

    expect(ctx.source).toBe("remote_access");
    expect(ctx.identity?.id).toBe("work");
    expect(ctx.identity?.email).toBe("fuad@workcorp.com");
    expect(ctx.account?.id).toBe("gitlab_fuadwork");
  });

  it("4. git-proxy automatically detects context and post-binds repo on native clone when override is enabled", async () => {
    // Map directory rule
    const teamDir = path.join(tempDir, "team-projects");
    fs.mkdirSync(teamDir, { recursive: true });

    store.addRule({
      id: "team_rule",
      path: teamDir,
      identityId: "work",
      defaultProvider: "gitlab",
      defaultAccountId: "gitlab_fuadwork",
    });

    // Enable override
    overrideManager.enable();
    expect(store.isOverrideEnabled()).toBe(true);

    const targetClone = path.join(teamDir, "native-cloned-app");

    // Execute native git clone through GitProxy
    const exitCode = await proxy.execute(["clone", bareRepoPath, targetClone]);
    expect(exitCode).toBe(0);

    // Verify post-clone auto-configuration
    const localConfigPath = path.join(targetClone, ".git", "gitbridge.json");
    expect(fs.existsSync(localConfigPath)).toBe(true);

    const localConfig = JSON.parse(fs.readFileSync(localConfigPath, "utf-8"));
    expect(localConfig.identityId).toBe("work");

    const clonedGit = new GitCli(targetClone);
    expect(await clonedGit.getConfig("user.name")).toBe("Fuad WorkCorp");
    expect(await clonedGit.getConfig("user.email")).toBe("fuad@workcorp.com");

    // Verify pre-commit safety hook was auto-installed
    const hookPath = path.join(targetClone, ".git", "hooks", "pre-commit");
    expect(fs.existsSync(hookPath)).toBe(true);
  });
});
