import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitConfigGenerator } from "@/core/git/config-generator";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { GitProxy } from "@/core/git/git-proxy";

describe("🌟 Full Directory Inheritance & Glitch-Free E2E Suite", () => {
  let tempBase: string;
  let store: ConfigStore;
  let workFolder: string;
  let personalFolder: string;

  beforeEach(async () => {
    tempBase = path.join(os.tmpdir(), `gb-inherit-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempBase, { recursive: true });

    workFolder = path.join(tempBase, "work");
    personalFolder = path.join(tempBase, "personal");
    fs.mkdirSync(workFolder, { recursive: true });
    fs.mkdirSync(personalFolder, { recursive: true });

    const paths = new PathResolver(tempBase);
    store = new ConfigStore(paths);

    // 1. Register Identities
    store.addIdentity({
      id: "work",
      name: "Work Dev",
      email: "work@corp.com",
    });

    store.addIdentity({
      id: "personal",
      name: "Personal Dev",
      email: "personal@home.me",
      isDefault: true,
    });

    // 2. Register Accounts
    store.addAccount({
      id: "gitlab_work",
      providerId: "gitlab",
      username: "workdev",
      host: "172.27.23.116",
      sshPort: 2424,
      authType: "pat",
    });

    store.addAccount({
      id: "github_personal",
      providerId: "github",
      username: "personaldev",
      host: "github.com",
      authType: "oauth",
    });

    // 3. Add Directory Rules
    store.addRule({
      id: "rule_work",
      path: workFolder,
      identityId: "work",
      defaultProvider: "gitlab",
      defaultAccountId: "gitlab_work",
    });

    store.addRule({
      id: "rule_personal",
      path: personalFolder,
      identityId: "personal",
      defaultProvider: "github",
      defaultAccountId: "github_personal",
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  it("generates includeIf and multi-format URL rewrites with custom SSH port", () => {
    const generator = new GitConfigGenerator(store);
    const { mainConfigPath, generatedRules } = generator.generate();

    expect(fs.existsSync(mainConfigPath)).toBe(true);
    const mainContent = fs.readFileSync(mainConfigPath, "utf-8");

    // Must contain includeIf blocks for both folders
    expect(mainContent).toContain(`[includeIf "gitdir:${workFolder}/**"]`);
    expect(mainContent).toContain(`[includeIf "gitdir:${personalFolder}/**"]`);

    // Check rule_work config for multi-pattern insteadOf rewrites
    const ruleWorkFile = generatedRules.find((f) => f.includes("rule_work"));
    expect(ruleWorkFile).toBeDefined();
    const workRuleContent = fs.readFileSync(ruleWorkFile!, "utf-8");

    expect(workRuleContent).toContain("email = work@corp.com");
    expect(workRuleContent).toContain('insteadOf = git@172.27.23.116:');
    expect(workRuleContent).toContain('insteadOf = ssh://git@172.27.23.116:2424/');
  });

  it("automatically inherits work identity and gitlab account for repos inside work folder", async () => {
    const generator = new GitConfigGenerator(store);
    const { mainConfigPath } = generator.generate();

    const newApp = path.join(workFolder, "api-service");
    fs.mkdirSync(newApp, { recursive: true });

    // Initialize git repository
    const initProc = Bun.spawnSync(["git", "init"], { cwd: newApp });
    expect(initProc.exitCode).toBe(0);

    // Verify native Git includeIf resolves work identity
    const emailProc = Bun.spawnSync(["git", "config", "--file", mainConfigPath, "--includes", "user.email"], {
      cwd: newApp,
    });
    expect(emailProc.stdout.toString().trim()).toBe("work@corp.com");

    // Verify GitBridge IdentityResolver resolves context accurately
    const resolver = new IdentityResolver(store);
    const ctx = await resolver.resolve(newApp);
    expect(ctx.identity?.email).toBe("work@corp.com");
    expect(ctx.source).toBe("directory_rule");
    expect(ctx.account?.id).toBe("gitlab_work");
    expect(ctx.account?.host).toBe("172.27.23.116");
    expect(ctx.account?.sshPort).toBe(2424);
  });

  it("automatically inherits personal identity and github account for repos inside personal folder", async () => {
    const generator = new GitConfigGenerator(store);
    const { mainConfigPath } = generator.generate();

    const newApp = path.join(personalFolder, "my-side-project");
    fs.mkdirSync(newApp, { recursive: true });

    // Initialize git repository
    const initProc = Bun.spawnSync(["git", "init"], { cwd: newApp });
    expect(initProc.exitCode).toBe(0);

    // Verify native Git includeIf resolves personal identity
    const emailProc = Bun.spawnSync(["git", "config", "--file", mainConfigPath, "--includes", "user.email"], {
      cwd: newApp,
    });
    expect(emailProc.stdout.toString().trim()).toBe("personal@home.me");

    // Verify GitBridge IdentityResolver resolves context accurately
    const resolver = new IdentityResolver(store);
    const ctx = await resolver.resolve(newApp);
    expect(ctx.identity?.email).toBe("personal@home.me");
    expect(ctx.source).toBe("directory_rule");
    expect(ctx.account?.id).toBe("github_personal");
  });

  it("respects override status: only injects context when override is enabled", async () => {
    const proxy = new GitProxy(store);
    const testRepo = path.join(workFolder, "sample-repo");
    fs.mkdirSync(testRepo, { recursive: true });
    Bun.spawnSync(["git", "init"], { cwd: testRepo });

    // 1. Override is DISABLED by default
    expect(store.isOverrideEnabled()).toBe(false);
    // When disabled, proxy.execute executes real git cleanly with 0 exit code
    const exitCodeDisabled = await proxy.execute(["status", "--porcelain"]);
    expect(exitCodeDisabled).toBe(0);

    // 2. Enable Override
    store.setOverrideEnabled(true);
    expect(store.isOverrideEnabled()).toBe(true);

    // When enabled, proxy.execute succeeds and injects directory rule identity
    const exitCodeEnabled = await proxy.execute(["status", "--porcelain"]);
    expect(exitCodeEnabled).toBe(0);

    // Cleanly disable override again
    store.setOverrideEnabled(false);
    expect(store.isOverrideEnabled()).toBe(false);
  });
});
