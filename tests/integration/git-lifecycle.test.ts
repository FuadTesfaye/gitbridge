import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitConfigInjector } from "@/core/git/gitconfig-injector";
import { GitCli } from "@/core/git/git-cli";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { IdentityGuard } from "@/core/safety/identity-guard";

describe("Git Lifecycle End-to-End Integration", () => {
  let sandboxDir: string;
  let homeDir: string;
  let store: ConfigStore;
  let paths: PathResolver;
  let injector: GitConfigInjector;

  beforeEach(() => {
    sandboxDir = path.join(os.tmpdir(), `gitbridge-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    homeDir = path.join(sandboxDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });

    paths = new PathResolver(path.join(homeDir, ".gitbridge"));
    store = new ConfigStore(paths);
    injector = new GitConfigInjector(store);
  });

  afterEach(() => {
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  it("automatically routes commit identities based on directory rules and includeIf", async () => {
    // 1. Define Identities
    store.addIdentity({
      id: "personal",
      name: "Fuad Personal",
      email: "personal@example.com",
      isDefault: true,
    });

    store.addIdentity({
      id: "work",
      name: "Fuad Work",
      email: "work@company.com",
      isDefault: false,
    });

    // 2. Define Directory Rules
    const workProjectsDir = path.join(sandboxDir, "work-projects");
    const personalProjectsDir = path.join(sandboxDir, "personal-projects");
    fs.mkdirSync(workProjectsDir, { recursive: true });
    fs.mkdirSync(personalProjectsDir, { recursive: true });

    store.addRule({
      id: "rule_work",
      path: workProjectsDir,
      identityId: "work",
    });

    store.addRule({
      id: "rule_personal",
      path: personalProjectsDir,
      identityId: "personal",
    });

    // 3. Inject into mock user .gitconfig
    const mockUserGitConfig = path.join(homeDir, ".gitconfig");
    injector.inject(mockUserGitConfig);

    expect(fs.existsSync(mockUserGitConfig)).toBe(true);

    // 4. Initialize Git Repo in work-projects/api-service
    const workRepo = path.join(workProjectsDir, "api-service");
    fs.mkdirSync(workRepo, { recursive: true });

    const env = { GIT_CONFIG_GLOBAL: mockUserGitConfig, HOME: homeDir };
    const gitWork = new GitCli(workRepo);
    await gitWork.exec(["init"], { env });

    // Verify Identity Resolution
    const resolver = new IdentityResolver(store);
    const workCtx = await resolver.resolve(workRepo);
    expect(workCtx.source).toBe("directory_rule");
    expect(workCtx.identity?.id).toBe("work");
    expect(workCtx.identity?.email).toBe("work@company.com");

    // 5. Initialize Git Repo in personal-projects/blog
    const personalRepo = path.join(personalProjectsDir, "blog");
    fs.mkdirSync(personalRepo, { recursive: true });

    const gitPersonal = new GitCli(personalRepo);
    await gitPersonal.exec(["init"], { env });

    const personalCtx = await resolver.resolve(personalRepo);
    expect(personalCtx.source).toBe("directory_rule");
    expect(personalCtx.identity?.id).toBe("personal");
    expect(personalCtx.identity?.email).toBe("personal@example.com");

    // 6. Test Safety Guard with correctly applied identity
    await gitWork.setConfig("user.email", "work@company.com", "local");
    const guard = new IdentityGuard(store);
    const workGuardRes = await guard.check(workRepo);
    expect(workGuardRes.allowed).toBe(true);

    // 7. If local repo email is intentionally wrong (mismatched)
    await gitWork.setConfig("user.email", "personal@example.com", "local");
    const mismatchedGuardRes = await guard.check(workRepo);
    expect(mismatchedGuardRes.allowed).toBe(false);
    expect(mismatchedGuardRes.currentEmail).toBe("personal@example.com");
    expect(mismatchedGuardRes.expectedEmail).toBe("work@company.com");
  });
});
