import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitCli } from "@/core/git/git-cli";
import { GitConfigGenerator } from "@/core/git/config-generator";
import { GitConfigInjector } from "@/core/git/gitconfig-injector";
import { SshConfigGenerator } from "@/core/ssh/ssh-config-generator";
import { SshInjector } from "@/core/ssh/ssh-injector";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { IdentityGuard } from "@/core/safety/identity-guard";
import { EncryptedVaultCredentialStore } from "@/core/storage/encrypted-vault";
import { parseRemoteUrl, buildSshUrl } from "@/core/git/url-parser";
import { BridgeService } from "../../extension/src/services/bridge.service";

describe("🌟 Comprehensive GitBridge Big E2E Lifecycle Matrix", () => {
  let sandboxDir: string;
  let homeDir: string;
  let workDir: string;
  let personalDir: string;
  let paths: PathResolver;
  let store: ConfigStore;
  let fakeGitConfig: string;
  let fakeSshConfig: string;

  beforeEach(() => {
    sandboxDir = path.join(os.tmpdir(), `gitbridge-comprehensive-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    homeDir = path.join(sandboxDir, "home");
    personalDir = path.join(sandboxDir, "workspace", "personal", "cool-project");
    workDir = path.join(sandboxDir, "workspace", "work", "corp-api");

    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(personalDir, { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });

    fakeGitConfig = path.join(homeDir, ".gitconfig");
    fakeSshConfig = path.join(homeDir, ".ssh", "config");
    fs.mkdirSync(path.dirname(fakeSshConfig), { recursive: true });
    fs.writeFileSync(fakeGitConfig, "[core]\n    editor = vim\n");
    fs.writeFileSync(fakeSshConfig, "# User base SSH config\nHost original\n    HostName original.com\n");

    const baseDir = path.join(homeDir, ".gitbridge");
    paths = new PathResolver(baseDir);
    store = new ConfigStore(paths);
  });

  afterEach(() => {
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  it("1. Lifecycle: Full Identity Creation & Precedence Flow", async () => {
    // 1. Setup Identities
    const personal = store.addIdentity({
      id: "personal",
      name: "Fuad Personal",
      email: "fuad@personal.me",
      isDefault: true,
    });
    expect(personal.id).toBe("personal");
    expect(personal.isDefault).toBe(true);

    const work = store.addIdentity({
      id: "work",
      name: "Fuad Work",
      email: "fuad@corporate.com",
      signingKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGitBridgeTestKey",
      isDefault: false,
    });
    expect(work.id).toBe("work");
    expect(work.signingKey).toContain("IGitBridgeTestKey");

    const client = store.addIdentity({
      id: "client-acme",
      name: "Fuad Acme",
      email: "fuad@acme-client.org",
      isDefault: false,
    });
    expect(client.id).toBe("client-acme");
    expect(store.loadIdentities().length).toBe(3);

    // 2. Directory Rules
    store.addRule({
      id: "rule_personal",
      path: path.join(sandboxDir, "workspace", "personal"),
      identityId: "personal",
    });

    store.addRule({
      id: "rule_work",
      path: path.join(sandboxDir, "workspace", "work"),
      identityId: "work",
    });

    expect(store.loadRules().length).toBe(2);

    // 3. Resolve context before repo creation
    const resolver = new IdentityResolver(store);
    const personalContext = await resolver.resolve(personalDir);
    expect(personalContext.source).toBe("directory_rule");
    expect(personalContext.identity?.email).toBe("fuad@personal.me");

    const workContext = await resolver.resolve(workDir);
    expect(workContext.source).toBe("directory_rule");
    expect(workContext.identity?.email).toBe("fuad@corporate.com");
    expect(workContext.identity?.signingKey).toContain("IGitBridgeTestKey");
  });

  it("2. Lifecycle: Git & SSH Injections, Generations and Clean Rollbacks", () => {
    store.addIdentity({ id: "personal", name: "Fuad", email: "fuad@p.me", isDefault: true });
    store.addIdentity({ id: "work", name: "Fuad", email: "fuad@w.me", isDefault: false });
    store.addRule({ id: "r1", path: personalDir, identityId: "personal" });
    store.addRule({ id: "r2", path: workDir, identityId: "work" });

    // Accounts for SSH generator
    store.addAccount({
      id: "github_personal",
      providerId: "github",
      host: "github.com",
      username: "FuadPersonal",
      authType: "oauth",
      sshKeyPath: path.join(homeDir, ".ssh", "id_personal"),
    });

    store.addAccount({
      id: "github_work",
      providerId: "github",
      host: "github.com",
      username: "FuadWork",
      authType: "oauth",
      sshKeyPath: path.join(homeDir, ".ssh", "id_work"),
    });

    // Generate config files
    const gitGen = new GitConfigGenerator(store);
    gitGen.generate();

    const sshGen = new SshConfigGenerator(store);
    sshGen.generate();

    expect(fs.existsSync(paths.getMainGitConfigFile())).toBe(true);
    expect(fs.existsSync(paths.getGeneratedSshConfigFile())).toBe(true);

    const sshContent = fs.readFileSync(paths.getGeneratedSshConfigFile(), "utf-8");
    expect(sshContent).toContain("Host github.com-github_personal");
    expect(sshContent).toContain("Host github.com-github_work");
    expect(sshContent).toContain("IdentitiesOnly yes");

    // Inject into fake user configs
    const gitInjector = new GitConfigInjector(store);
    const sshInjector = new SshInjector(store);

    expect(gitInjector.isInstalled(fakeGitConfig)).toBe(false);
    expect(sshInjector.isInstalled(fakeSshConfig)).toBe(false);

    gitInjector.inject(fakeGitConfig);
    sshInjector.inject(fakeSshConfig);

    expect(gitInjector.isInstalled(fakeGitConfig)).toBe(true);
    expect(sshInjector.isInstalled(fakeSshConfig)).toBe(true);

    // Verify user configs still have their original content
    const injectedGit = fs.readFileSync(fakeGitConfig, "utf-8");
    expect(injectedGit).toContain("editor = vim");
    expect(injectedGit).toContain("BEGIN GITBRIDGE MANAGED BLOCK");

    const injectedSsh = fs.readFileSync(fakeSshConfig, "utf-8");
    expect(injectedSsh).toContain("Host original");
    expect(injectedSsh).toContain("Include");

    // Rollback / Disable
    gitInjector.remove(fakeGitConfig);
    sshInjector.remove(fakeSshConfig);

    expect(gitInjector.isInstalled(fakeGitConfig)).toBe(false);
    expect(sshInjector.isInstalled(fakeSshConfig)).toBe(false);

    const revertedGit = fs.readFileSync(fakeGitConfig, "utf-8");
    expect(revertedGit).toContain("editor = vim");
    expect(revertedGit).not.toContain("BEGIN GITBRIDGE MANAGED BLOCK");
  });

  it("3. Lifecycle: Hardware Vault Credential Store Security", async () => {
    const vault = new EncryptedVaultCredentialStore(paths);

    await vault.set("github.com", "github_user1", "gho_super_secret_token_12345");
    await vault.set("gitlab.com", "gitlab_user1", "glpat_another_secret_token_67890");

    const token1 = await vault.get("github.com", "github_user1");
    expect(token1).toBe("gho_super_secret_token_12345");

    const token2 = await vault.get("gitlab.com", "gitlab_user1");
    expect(token2).toBe("glpat_another_secret_token_67890");

    // Verify vault file is strictly encrypted (not plaintext)
    const vaultPath = paths.getEncryptedVaultFile();
    expect(fs.existsSync(vaultPath)).toBe(true);
    const rawVault = fs.readFileSync(vaultPath, "utf-8");
    expect(rawVault).not.toContain("gho_super_secret_token_12345");
    expect(rawVault).not.toContain("glpat_another_secret_token_67890");

    // Delete token
    await vault.delete("github.com", "github_user1");
    const deletedToken = await vault.get("github.com", "github_user1");
    expect(deletedToken).toBeNull();
  });

  it("4. Lifecycle: Real Git Commits with includeIf & Precedence", async () => {
    store.addIdentity({ id: "personal", name: "Fuad Personal", email: "personal@example.com", isDefault: true });
    store.addIdentity({ id: "work", name: "Fuad Work", email: "work@corporate.com", isDefault: false });
    store.addRule({ id: "rule_work", path: path.join(sandboxDir, "workspace", "work"), identityId: "work" });

    const gitGen = new GitConfigGenerator(store);
    gitGen.generate();

    const gitInjector = new GitConfigInjector(store);
    gitInjector.inject(fakeGitConfig);

    // Initialize personal Git repo
    const gitPersonal = new GitCli(personalDir);
    await gitPersonal.exec(["init"]);
    fs.writeFileSync(path.join(personalDir, "README.md"), "# Personal App");
    await gitPersonal.exec(["add", "."]);
    await gitPersonal.exec([
      "-c", `include.path=${paths.getMainGitConfigFile()}`,
      "commit", "-m", "feat: personal initial commit"
    ]);

    const logPersonal = await gitPersonal.exec(["log", "-n", "1", "--format=%an <%ae>"]);
    expect(logPersonal.stdout).toContain("personal@example.com");

    // Initialize work Git repo
    const gitWork = new GitCli(workDir);
    await gitWork.exec(["init"]);
    fs.writeFileSync(path.join(workDir, "README.md"), "# Work Microservice");
    await gitWork.exec(["add", "."]);
    await gitWork.exec([
      "-c", `include.path=${paths.getMainGitConfigFile()}`,
      "commit", "-m", "feat: work initial commit"
    ]);

    const logWork = await gitWork.exec(["log", "-n", "1", "--format=%an <%ae>"]);
    expect(logWork.stdout).toContain("work@corporate.com");

    // Test Precedence: Repository profile override
    store.addIdentity({ id: "contractor", name: "Fuad Contractor", email: "contractor@client.com" });
    store.saveRepositoryProfile({
      path: workDir,
      identityId: "contractor",
      remotes: [],
    });

    const resolver = new IdentityResolver(store);
    const overrideContext = await resolver.resolve(workDir);
    expect(overrideContext.source).toBe("repo_profile");
    expect(overrideContext.identity?.email).toBe("contractor@client.com");
  });

  it("5. Lifecycle: Pre-Commit Identity Guard & Safety Hook", async () => {
    const git = new GitCli(personalDir);
    await git.exec(["init"]);

    const guard = new IdentityGuard(store);
    expect(guard.isInstalled(personalDir)).toBe(false);

    const installed = await guard.install(personalDir);
    expect(installed).toBe(true);
    expect(guard.isInstalled(personalDir)).toBe(true);

    const uninstalled = await guard.uninstall(personalDir);
    expect(uninstalled).toBe(true);
    expect(guard.isInstalled(personalDir)).toBe(false);
  });

  it("6. Lifecycle: URL Parser & SSH Account Host Routing", () => {
    const ghUrl = "git@github.com:FuadTesfaye/gitbridge.git";
    const parsed = parseRemoteUrl(ghUrl);
    expect(parsed).not.toBeNull();
    expect(parsed?.providerId).toBe("github");
    expect(parsed?.host).toBe("github.com");
    expect(parsed?.owner).toBe("FuadTesfaye");
    expect(parsed?.repo).toBe("gitbridge");

    // Build SSH host alias URL
    const routedUrl = buildSshUrl("github.com", "FuadTesfaye", "gitbridge", "work_account");
    expect(routedUrl).toBe("git@github.com-work_account:FuadTesfaye/gitbridge.git");

    const parsedRouted = parseRemoteUrl(routedUrl);
    expect(parsedRouted?.host).toBe("github.com");
    expect(parsedRouted?.rawHost).toBe("github.com-work_account");
    expect(parsedRouted?.accountAlias).toBe("work_account");
  });

  it("7. Lifecycle: Extension Bridge Service & Diagnostics", async () => {
    const extBridge = new BridgeService(store);

    await extBridge.addIdentity({
      id: "opensource",
      name: "Fuad OpenSource",
      email: "os@github.org",
      isDefault: true,
    });

    expect(extBridge.loadIdentities().length).toBe(1);

    const report = await extBridge.runDiagnostics();
    expect(report).toContain("GitBridge System Diagnostics");
    expect(report).toContain("Provider Connectivity");
    expect(report).toContain("GitHub");
    expect(report).toContain("GitLab");
    expect(report).toContain("Bitbucket");
  });
});
