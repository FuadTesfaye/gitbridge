import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { handleRepoSet, handleRepoUnset } from "@/cli/commands/repo";

describe("Repository Persistent Binding (Memory)", () => {
  let tempDir: string;
  let store: ConfigStore;
  let mockRepo: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gb-repo-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);

    // Register test identities
    store.addIdentity({ id: "work", name: "Work User", email: "work@corp.com" });
    store.addIdentity({ id: "personal", name: "Personal User", email: "personal@home.me", isDefault: true });

    // Mock git repo
    mockRepo = path.join(tempDir, "client-app");
    fs.mkdirSync(mockRepo, { recursive: true });
    const proc = Bun.spawn(["git", "init"], { cwd: mockRepo });
    await proc.exited;
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("binds a repository permanently to an identity, email, and provider without asking again", async () => {
    // Set repo to 'work' identity with gitlab provider
    await handleRepoSet(mockRepo, { identity: "work", provider: "gitlab" }, store);

    // Verify local .git/gitbridge.json override was written
    const localFile = path.join(mockRepo, ".git", "gitbridge.json");
    expect(fs.existsSync(localFile)).toBe(true);
    const localContent = JSON.parse(fs.readFileSync(localFile, "utf-8"));
    expect(localContent.identityId).toBe("work");
    expect(localContent.providerId).toBe("gitlab");

    // Verify repos.json has the profile
    const repos = store.loadRepositories();
    expect(repos.some((r) => r.path === mockRepo && r.identityId === "work")).toBe(true);

    // Verify IdentityResolver resolves 'work' identity for this repo (Tier 1)
    const resolver = new IdentityResolver(store);
    const ctx = await resolver.resolve(mockRepo);
    expect(ctx.identity?.email).toBe("work@corp.com");
    expect(ctx.source).toBe("repo_profile");

    // Unset profile
    await handleRepoUnset(mockRepo, store);
    expect(fs.existsSync(localFile)).toBe(false);

    // Now it should fall back to global default (personal)
    const ctxAfter = await resolver.resolve(mockRepo);
    expect(ctxAfter.identity?.email).toBe("personal@home.me");
    expect(ctxAfter.source).toBe("global_default");
  });
});
