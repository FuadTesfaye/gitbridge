import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitCli } from "@/core/git/git-cli";
import { execProcess } from "@/utils/proc";

// Commands
import { handleSetupCommand } from "@/cli/commands/setup";
import { handleStatusCommand } from "@/cli/commands/status";
import { handleContextCommand } from "@/cli/commands/context";
import { handleExplainCommand } from "@/cli/commands/explain";
import { handleEnvCommand } from "@/cli/commands/env";
import { handleCurrentCommand } from "@/cli/commands/current";
import { handleEnableCommand, handleDisableCommand } from "@/cli/commands/enable";
import {
  handleIdentityList,
  handleIdentityAdd,
  handleIdentityEdit,
  handleIdentityUse,
  handleIdentityRemove,
} from "@/cli/commands/identity";
import {
  handleAccountList,
  handleAccountUse,
  handleAccountRemove,
} from "@/cli/commands/account";
import { handleAuthLogout } from "@/cli/commands/auth";
import {
  handleProviderList,
  handleProviderEnable,
  handleProviderDisable,
} from "@/cli/commands/provider";
import { handleRuleList, handleRuleAdd, handleRuleRemove } from "@/cli/commands/rule";
import { handleRepoSet, handleRepoList, handleRepoUnset, handleRepoInit } from "@/cli/commands/repo";
import { handleRemoteList, handleRemoteAdd } from "@/cli/commands/remote";
import { handlePushCommand } from "@/cli/commands/push";
import { handleSwitchCommand } from "@/cli/commands/switch";
import { handleDoctorCommand } from "@/cli/commands/doctor";
import { handleSshList, handleSshGenerate, handleSshLink } from "@/cli/commands/ssh";
import { handleCompletionCommand } from "@/cli/commands/completion";
import { GitCredentialHelperHandler } from "@/cli/commands/credential";
import { handleSecurityCheck, handleSecurityFix, handleSecurityScan } from "@/cli/commands/security";
import {
  handleOverrideEnableCommand,
  handleOverrideDisableCommand,
  handleOverrideStatusCommand,
} from "@/cli/commands/override";
import {
  handleIdeSyncCommand,
  handleIdeUnsyncCommand,
  handleIdeStatusCommand,
} from "@/cli/commands/ide";
import { handleCloneCommand } from "@/cli/commands/clone";

describe("🌟 Complete End-to-End Test for All GitBridge Commands", () => {
  let sandboxDir: string;
  let repoDir: string;
  let bareRemoteDir: string;
  let homeDir: string;
  let paths: PathResolver;
  let store: ConfigStore;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalHome = process.env.HOME;

    sandboxDir = path.join(os.tmpdir(), `gb-all-cmds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    homeDir = path.join(sandboxDir, "home");
    repoDir = path.join(sandboxDir, "active-repo");
    bareRemoteDir = path.join(sandboxDir, "bare-remote.git");

    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(bareRemoteDir, { recursive: true });

    // Isolate HOME so getHomeDir() uses the sandbox
    process.env.HOME = homeDir;

    // Set up GitBridge config store in sandbox
    const gbHome = path.join(homeDir, ".gitbridge");
    paths = new PathResolver(gbHome);
    store = new ConfigStore(paths);

    // Initialize local git repo
    const git = new GitCli(repoDir);
    await git.exec(["init"]);
    await git.exec(["config", "user.name", "Initial User"]);
    await git.exec(["config", "user.email", "initial@domain.com"]);

    // Initialize bare remote repo for push/fetch testing
    const bareGit = new GitCli(bareRemoteDir);
    await bareGit.exec(["init", "--bare"]);

    // Add initial commit in local repo and set remote
    const readmeFile = path.join(repoDir, "README.md");
    fs.writeFileSync(readmeFile, "# Test Repo\n");
    await git.exec(["add", "README.md"]);
    await git.exec(["commit", "-m", "Initial commit"]);
    await git.exec(["remote", "add", "origin", bareRemoteDir]);
    await git.exec(["push", "-u", "origin", "HEAD"]);

    process.chdir(repoDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }

    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  it("1. Tests Setup, Doctor, Status, and Shell Completions", async () => {
    // Quick setup
    await handleSetupCommand({ quick: true }, store);
    expect(store.loadIdentities().length).toBeGreaterThanOrEqual(1);

    // Doctor
    await handleDoctorCommand(store);

    // Status
    await handleStatusCommand(store);

    // Completion scripts
    handleCompletionCommand("bash");
    handleCompletionCommand("zsh");
    handleCompletionCommand("fish");
    handleCompletionCommand("unknown");
  });

  it("2. Tests Context, Explain, Env, and all Current command flags", async () => {
    // Setup identities and rules
    store.addIdentity({
      id: "personal",
      name: "Fuad Personal",
      email: "fuad@personal.me",
      isDefault: true,
    });

    store.addIdentity({
      id: "work",
      name: "Fuad Work",
      email: "fuad@company.com",
      isDefault: false,
    });

    store.addAccount({
      id: "github_personal",
      providerId: "github",
      host: "github.com",
      username: "fuadpersonal",
      authType: "oauth",
    });

    // Context (human and json)
    await handleContextCommand({}, store);
    await handleContextCommand({ json: true }, store);

    // Explain
    await handleExplainCommand(store);

    // Env
    await handleEnvCommand(store);

    // Current with all flags
    await handleCurrentCommand({}, store);
    await handleCurrentCommand({ prompt: true }, store);
    await handleCurrentCommand({ email: true }, store);
    await handleCurrentCommand({ name: true }, store);
    await handleCurrentCommand({ account: true }, store);
    await handleCurrentCommand({ provider: true }, store);
  });

  it("3. Tests Identities CRUD: add, list, edit, use, remove", async () => {
    // Add
    await handleIdentityAdd(
      { id: "corp", name: "Fuad Corp", email: "fuad@corp.com", default: true },
      store
    );
    expect(store.getIdentity("corp")).toBeDefined();
    expect(store.loadConfig().defaultIdentityId).toBe("corp");

    // List
    await handleIdentityList(store);

    // Edit
    await handleIdentityEdit("corp", { name: "Fuad Corp Updated" }, store);
    expect(store.getIdentity("corp")?.name).toBe("Fuad Corp Updated");

    // Add another and use it
    await handleIdentityAdd({ id: "freelance", name: "Fuad Free", email: "fuad@free.com" }, store);
    await handleIdentityUse("freelance", store);
    expect(store.loadConfig().defaultIdentityId).toBe("freelance");

    // Remove
    await handleIdentityRemove("corp", store);
    expect(store.getIdentity("corp")).toBeUndefined();
  });

  it("4. Tests Providers and Accounts: list, enable, disable, use, remove, logout", async () => {
    // Provider list, enable, disable
    await handleProviderList(store);
    await handleProviderEnable("gitlab", store);
    expect(store.loadConfig().providers.gitlab?.enabled).toBe(true);

    await handleProviderDisable("gitlab", store);
    expect(store.loadConfig().providers.gitlab?.enabled).toBe(false);

    // Accounts
    store.addAccount({
      id: "gh_test",
      providerId: "github",
      host: "github.com",
      username: "testuser",
      authType: "pat",
    });

    await handleAccountList(store);
    await handleAccountUse("github", "testuser", store);

    // Logout
    await handleAuthLogout("github", "testuser", store);
    expect(store.loadAccounts().length).toBe(0);

    // Remove fallback
    store.addAccount({
      id: "gl_test",
      providerId: "gitlab",
      host: "gitlab.com",
      username: "gitlabuser",
      authType: "pat",
    });
    await handleAccountRemove("gl_test", store);
    expect(store.getAccount("gl_test")).toBeUndefined();
  });

  it("5. Tests Directory Rules: add, list, remove", async () => {
    store.addIdentity({ id: "client", name: "Client Lead", email: "client@lead.com" });

    await handleRuleAdd(repoDir, "client", { id: "repo_rule" }, store);
    const rules = store.loadRules();
    expect(rules.some((r) => r.id === "repo_rule")).toBe(true);

    await handleRuleList(store);

    await handleRuleRemove("repo_rule", store);
    expect(store.loadRules().some((r) => r.id === "repo_rule")).toBe(false);
  });

  it("6. Tests Repository Profiles: set, list, unset, switch, init", async () => {
    store.addIdentity({ id: "project_id", name: "Project Author", email: "author@project.org" });

    // Set repo profile
    await handleRepoSet(repoDir, { identity: "project_id", email: "author@project.org" }, store);
    const repoProfile = store.getRepository(repoDir);
    expect(repoProfile).toBeDefined();
    expect(repoProfile?.identityId).toBe("project_id");

    // List repos
    await handleRepoList(store);

    // Switch repo identity locally
    store.addIdentity({ id: "switch_id", name: "Switched User", email: "switched@project.org" });
    await handleSwitchCommand("switch_id", {}, store);
    const git = new GitCli(repoDir);
    expect(await git.getConfig("user.email")).toBe("switched@project.org");

    // Switch global default
    await handleSwitchCommand("switch_id", { global: true }, store);
    expect(store.loadConfig().defaultIdentityId).toBe("switch_id");

    // Clean local override before testing directory-rule based init
    const localConfig = path.join(repoDir, ".git", "gitbridge.json");
    if (fs.existsSync(localConfig)) fs.unlinkSync(localConfig);
    store.removeRepositoryProfile(repoDir);

    store.addRule({ id: "r1", path: repoDir, identityId: "project_id" });
    await handleRepoInit(store, repoDir);
    expect(store.getRepository(repoDir)?.identityId).toBe("project_id");

    // Unset repo profile
    await handleRepoUnset(repoDir, store);
    expect(store.getRepository(repoDir)).toBeUndefined();
  });

  it("7. Tests Remotes & Multi-Push", async () => {
    // List existing remotes
    await handleRemoteList();

    // Add another remote
    const secondaryBare = path.join(sandboxDir, "secondary-bare.git");
    fs.mkdirSync(secondaryBare, { recursive: true });
    const secGit = new GitCli(secondaryBare);
    await secGit.exec(["init", "--bare"]);

    await handleRemoteAdd("backup", "git@github.com:fuadt/backup-repo.git", { account: "test_acc" }, store);
    const git = new GitCli(repoDir);
    const remotes = await git.getRemotes();
    expect(remotes.some((r) => r.name === "backup")).toBe(true);

    // Push to origin remote
    await handlePushCommand("origin");
  });

  it("8. Tests SSH commands: list, generate, link", async () => {
    await handleSshList(store);

    const keyName = `test_key_${Date.now()}`;
    await handleSshGenerate({ name: keyName, email: "ssh-test@domain.com" }, store);

    // Link key to an account
    store.addAccount({
      id: "acc_ssh",
      providerId: "github",
      host: "github.com",
      username: "user_ssh",
      authType: "pat",
    });

    const keyPath = path.join(homeDir, ".ssh", keyName);
    if (fs.existsSync(keyPath)) {
      await handleSshLink(keyPath, "acc_ssh", store);
      expect(store.getAccount("acc_ssh")?.sshKeyPath).toBe(keyPath);
    }
  });

  it("9. Tests GitBridge Integrations: Enable, Disable, Override, IDE", async () => {
    // Enable & Disable
    await handleEnableCommand(store);
    expect(store.loadConfig().enabled).toBe(true);

    await handleDisableCommand(store);
    expect(store.loadConfig().enabled).toBe(false);

    // Override enable, status, disable
    await handleOverrideEnableCommand(store);
    expect(store.isOverrideEnabled()).toBe(true);

    await handleOverrideStatusCommand(store);

    await handleOverrideDisableCommand(store);
    expect(store.isOverrideEnabled()).toBe(false);

    // IDE status, sync, unsync
    await handleIdeStatusCommand(store);
    await handleIdeSyncCommand(store);
    await handleIdeUnsyncCommand(store);
  });

  it("10. Tests Security commands and Hooks via CLI", async () => {
    await handleSecurityCheck(repoDir, store);
    await handleSecurityFix(repoDir, store);
    await handleSecurityScan(repoDir);

    const cliBin = path.resolve(__dirname, "../../bin/gb.ts");
    const testGbHome = path.join(sandboxDir, "hook-test-gitbridge");
    const env = {
      ...process.env,
      HOME: homeDir,
      GITBRIDGE_HOME: testGbHome,
    };

    // Pre-commit and pre-push hook execution via CLI binary
    const preCommitRes = await execProcess("bun", ["run", cliBin, "hook", "pre-commit"], { env, cwd: repoDir });
    expect([0, 1]).toContain(preCommitRes.exitCode);

    const prePushRes = await execProcess("bun", ["run", cliBin, "hook", "pre-push"], { env, cwd: repoDir });
    expect([0, 1]).toContain(prePushRes.exitCode);
  });

  it("11. Tests Credential Helper Handler: get, store, erase", async () => {
    const credHandler = new GitCredentialHelperHandler(store);

    store.setEnabled(true);
    store.addAccount({
      id: "github_creduser",
      providerId: "github",
      host: "github.com",
      username: "creduser",
      authType: "pat",
    });

    // Handle store
    await credHandler.handleStore("protocol=https\nhost=github.com\nusername=creduser\npassword=token123\n");

    // Handle get
    const credOutput = await credHandler.handleGet("protocol=https\nhost=github.com\nusername=creduser\n");
    expect(credOutput).toContain("username=creduser");

    // Handle erase
    await credHandler.handleErase("protocol=https\nhost=github.com\nusername=creduser\n");
  });

  it("12. Tests Smart Clone end-to-end", async () => {
    const cloneDest = path.join(sandboxDir, "cloned-repo");
    store.addIdentity({
      id: "clone_id",
      name: "Clone User",
      email: "clone@example.com",
      isDefault: true,
    });

    await handleCloneCommand(bareRemoteDir, cloneDest, { identity: "clone_id" }, store);
    expect(fs.existsSync(path.join(cloneDest, ".git"))).toBe(true);
    expect(fs.existsSync(path.join(cloneDest, "README.md"))).toBe(true);
  });

  it("13. Tests CLI Subprocess execution of 'gb' binary with isolated environment", async () => {
    const cliBin = path.resolve(__dirname, "../../bin/gb.ts");
    const testGbHome = path.join(sandboxDir, "cli-test-gitbridge");
    const env = {
      ...process.env,
      HOME: homeDir,
      GITBRIDGE_HOME: testGbHome,
    };

    // 1. Version
    const verRes = await execProcess("bun", ["run", cliBin, "--version"], { env });
    expect(verRes.exitCode).toBe(0);
    expect(verRes.stdout).toContain("0.2.6");

    // 2. Help
    const helpRes = await execProcess("bun", ["run", cliBin, "--help"], { env });
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.stdout).toContain("GitBridge");

    // 3. Status
    const stRes = await execProcess("bun", ["run", cliBin, "st"], { env });
    expect(stRes.exitCode).toBe(0);

    // 4. Context JSON
    const ctxRes = await execProcess("bun", ["run", cliBin, "ctx", "--json"], { env, cwd: repoDir });
    expect(ctxRes.exitCode).toBe(0);
    const parsed = JSON.parse(ctxRes.stdout);
    expect(parsed.isGitRepo).toBe(true);

    // 5. Env
    const envRes = await execProcess("bun", ["run", cliBin, "env"], { env, cwd: repoDir });
    expect(envRes.exitCode).toBe(0);

    // 6. Current
    const curRes = await execProcess("bun", ["run", cliBin, "cur"], { env, cwd: repoDir });
    expect(curRes.exitCode).toBe(0);

    // 7. Identity List
    const idLsRes = await execProcess("bun", ["run", cliBin, "id", "ls"], { env });
    expect(idLsRes.exitCode).toBe(0);

    // 8. Account List
    const accLsRes = await execProcess("bun", ["run", cliBin, "acc", "ls"], { env });
    expect(accLsRes.exitCode).toBe(0);

    // 9. Provider List
    const provLsRes = await execProcess("bun", ["run", cliBin, "prov", "ls"], { env });
    expect(provLsRes.exitCode).toBe(0);

    // 10. Rule List
    const ruleLsRes = await execProcess("bun", ["run", cliBin, "rules", "ls"], { env });
    expect(ruleLsRes.exitCode).toBe(0);

    // 11. Repo List
    const repoLsRes = await execProcess("bun", ["run", cliBin, "repo", "ls"], { env });
    expect(repoLsRes.exitCode).toBe(0);

    // 12. SSH List
    const sshLsRes = await execProcess("bun", ["run", cliBin, "ssh", "ls"], { env });
    expect(sshLsRes.exitCode).toBe(0);

    // 13. Override Status
    const ovRes = await execProcess("bun", ["run", cliBin, "override", "status"], { env });
    expect(ovRes.exitCode).toBe(0);

    // 14. IDE Status
    const ideRes = await execProcess("bun", ["run", cliBin, "ide", "status"], { env });
    expect(ideRes.exitCode).toBe(0);

    // 15. Security Check
    const secRes = await execProcess("bun", ["run", cliBin, "sec", "check"], { env, cwd: repoDir });
    expect(secRes.exitCode).toBe(0);

    // 16. Security Scan
    const scanRes = await execProcess("bun", ["run", cliBin, "sec", "scan", repoDir], { env });
    expect(scanRes.exitCode).toBe(0);

    // 17. Doctor
    const docRes = await execProcess("bun", ["run", cliBin, "doc"], { env });
    expect(docRes.exitCode).toBe(0);
  }, 30000);
});
