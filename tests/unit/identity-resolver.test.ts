import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { IdentityResolver } from "@/core/identity/identity-resolver";

describe("IdentityResolver", () => {
  let tempDir: string;
  let store: ConfigStore;
  let resolver: IdentityResolver;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-resolver-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    resolver = new IdentityResolver(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves global default identity when no rules match", async () => {
    store.addIdentity({ id: "personal", name: "Fuad Personal", email: "p@example.com" });
    store.addIdentity({ id: "work", name: "Fuad Work", email: "w@company.com" });
    store.setDefaultIdentity("personal");

    const ctx = await resolver.resolve(tempDir);
    expect(ctx.source).toBe("global_default");
    expect(ctx.identity?.id).toBe("personal");
    expect(ctx.identity?.email).toBe("p@example.com");
  });

  it("resolves directory rule when path matches", async () => {
    store.addIdentity({ id: "personal", name: "Fuad Personal", email: "p@example.com" });
    store.addIdentity({ id: "work", name: "Fuad Work", email: "w@company.com" });

    const workDir = path.join(tempDir, "company", "microservices", "auth");
    fs.mkdirSync(workDir, { recursive: true });

    store.addRule({
      id: "company_rule",
      path: path.join(tempDir, "company"),
      identityId: "work",
    });

    const ctx = await resolver.resolve(workDir);
    expect(ctx.source).toBe("directory_rule");
    expect(ctx.identity?.id).toBe("work");
    expect(ctx.identity?.email).toBe("w@company.com");
    expect(ctx.matchedRule?.id).toBe("company_rule");
  });

  it("prioritizes repository profile over directory rule", async () => {
    store.addIdentity({ id: "personal", name: "Fuad Personal", email: "p@example.com" });
    store.addIdentity({ id: "work", name: "Fuad Work", email: "w@company.com" });
    store.addIdentity({ id: "opensource", name: "Fuad OS", email: "os@example.com" });

    const repoPath = path.join(tempDir, "company", "open-tool");
    fs.mkdirSync(repoPath, { recursive: true });

    // Directory rule points to 'work'
    store.addRule({
      id: "company_rule",
      path: path.join(tempDir, "company"),
      identityId: "work",
    });

    // Explicit repo profile points to 'opensource'
    store.saveRepositoryProfile({
      path: repoPath,
      identityId: "opensource",
      remotes: [],
    });

    const ctx = await resolver.resolve(repoPath);
    expect(ctx.source).toBe("repo_profile");
    expect(ctx.identity?.id).toBe("opensource");
    expect(ctx.identity?.email).toBe("os@example.com");
  });

  it("prioritizes local repository config (.git/gitbridge.json) above all else", async () => {
    store.addIdentity({ id: "personal", name: "Fuad Personal", email: "p@example.com" });
    store.addIdentity({ id: "client_special", name: "Client Special", email: "client@special.com" });

    const localRepo = path.join(tempDir, "client_project");
    fs.mkdirSync(path.join(localRepo, ".git"), { recursive: true });

    // Write .git/gitbridge.json
    fs.writeFileSync(
      path.join(localRepo, ".git", "gitbridge.json"),
      JSON.stringify({ profile: "client_special" }),
      "utf-8"
    );

    const ctx = await resolver.resolve(localRepo);
    expect(ctx.source).toBe("repo_profile");
    expect(ctx.identity?.id).toBe("client_special");
    expect(ctx.identity?.email).toBe("client@special.com");
  });
});
