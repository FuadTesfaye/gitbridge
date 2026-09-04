import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { RepoAccessDetector } from "@/core/providers/repo-access-detector";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";
import { StoreFactory } from "@/core/storage/store-factory";

describe("RepoAccessDetector Unit Tests", () => {
  let tempDir: string;
  let store: ConfigStore;
  let paths: PathResolver;
  let detector: RepoAccessDetector;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gb-access-detector-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    detector = new RepoAccessDetector(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("Priority 1: honors explicit CLI flags over all else", async () => {
    store.addIdentity({ id: "explicit_id", name: "Explicit User", email: "explicit@corp.com" });
    store.addAccount({
      id: "explicit_acc",
      providerId: "github",
      host: "github.com",
      username: "explicituser",
      authType: "pat",
    });

    const result = await detector.detectAccess({
      url: "git@github.com:otheruser/project.git",
      explicitIdentityId: "explicit_id",
      explicitAccountId: "explicit_acc",
    });

    expect(result.matched).toBe(true);
    expect(result.tier).toBe("explicit_flag");
    expect(result.identityId).toBe("explicit_id");
    expect(result.accountId).toBe("explicit_acc");
    expect(result.email).toBe("explicit@corp.com");
  });

  it("Priority 2: honors directory rules when target directory is inside a mapped rule", async () => {
    store.addIdentity({ id: "work_id", name: "Work User", email: "work@company.com" });
    store.addAccount({
      id: "work_acc",
      providerId: "gitlab",
      host: "gitlab.company.com",
      username: "workdev",
      authType: "pat",
    });

    const workDir = path.join(tempDir, "work", "projects");
    fs.mkdirSync(workDir, { recursive: true });

    store.addRule({
      id: "work_rule",
      path: path.join(tempDir, "work"),
      identityId: "work_id",
      defaultProvider: "gitlab",
      defaultAccountId: "work_acc",
    });

    const result = await detector.detectAccess({
      url: "git@github.com:personal/project.git",
      targetPath: path.join(workDir, "new-repo"),
    });

    expect(result.matched).toBe(true);
    expect(result.tier).toBe("directory_rule");
    expect(result.identityId).toBe("work_id");
    expect(result.accountId).toBe("work_acc");
    expect(result.email).toBe("work@company.com");
  });

  it("Priority 3: automatically matches account via namespace ownership", async () => {
    store.addIdentity({ id: "fuad_ident", name: "Fuad Tesfaye", email: "fuad@gmail.com" });
    store.addAccount({
      id: "github_fuadtesfaye",
      providerId: "github",
      host: "github.com",
      username: "FuadTesfaye",
      email: "fuad@gmail.com",
      identityId: "fuad_ident",
      authType: "pat",
    });

    const result = await detector.detectAccess({
      url: "git@github.com:FuadTesfaye/gitbridge.git",
      targetPath: tempDir,
    });

    expect(result.matched).toBe(true);
    expect(result.tier).toBe("namespace_match");
    expect(result.accountId).toBe("github_fuadtesfaye");
    expect(result.identityId).toBe("fuad_ident");
    expect(result.email).toBe("fuad@gmail.com");
  });

  it("Priority 3: automatically probes token API access across multiple accounts", async () => {
    store.addIdentity({ id: "id_alice", name: "Alice", email: "alice@org.com" });
    store.addIdentity({ id: "id_bob", name: "Bob", email: "bob@org.com" });

    store.addAccount({
      id: "github_alice",
      providerId: "github",
      host: "github.com",
      username: "alice",
      email: "alice@org.com",
      identityId: "id_alice",
      authType: "pat",
    });

    store.addAccount({
      id: "github_bob",
      providerId: "github",
      host: "github.com",
      username: "bob",
      email: "bob@org.com",
      identityId: "id_bob",
      authType: "pat",
    });

    // Save tokens in vault
    const credStore = await StoreFactory.getStore(paths);
    await credStore.set("github.com", "github_alice", "token_alice_noperm");
    await credStore.set("github.com", "github_bob", "token_bob_hasaccess");

    // Mock checkRepoAccess on GitHub provider
    const github = defaultProviderRegistry.get("github");
    const originalCheck = github?.checkRepoAccess;
    try {
      if (github) {
        github.checkRepoAccess = async (token: string, owner: string, repo: string) => {
          if (token === "token_bob_hasaccess" && owner === "company" && repo === "secret-repo") {
            return { hasAccess: true, permission: "write", owner, repo };
          }
          return { hasAccess: false };
        };
      }

      const result = await detector.detectAccess({
        url: "https://github.com/company/secret-repo.git",
        targetPath: tempDir,
      });

      expect(result.matched).toBe(true);
      expect(result.tier).toBe("token_api");
      expect(result.accountId).toBe("github_bob");
      expect(result.identityId).toBe("id_bob");
      expect(result.email).toBe("bob@org.com");
    } finally {
      if (github && originalCheck) {
        github.checkRepoAccess = originalCheck;
      }
    }
  });

  it("Priority 3: routes via SSH key when protocol is SSH and account has SSH key", async () => {
    const fakeKey = path.join(tempDir, "id_ed25519");
    fs.writeFileSync(fakeKey, "fake-key-content", { mode: 0o600 });

    store.addIdentity({ id: "ssh_user", name: "SSH Developer", email: "ssh@gitlab.com" });
    store.addAccount({
      id: "gitlab_ssh",
      providerId: "gitlab",
      host: "gitlab.com",
      username: "sshdeveloper",
      email: "ssh@gitlab.com",
      identityId: "ssh_user",
      authType: "ssh",
      sshKeyPath: fakeKey,
    });

    const result = await detector.detectAccess({
      url: "git@gitlab.com:enterprise/infra.git",
      targetPath: tempDir,
    });

    expect(result.matched).toBe(true);
    expect(result.accountId).toBe("gitlab_ssh");
    expect(result.sshKeyPath).toBe(fakeKey);
    expect(result.email).toBe("ssh@gitlab.com");
  });

  it("synthesizes GitIdentity on the fly if account has email but no identity was configured", async () => {
    store.addAccount({
      id: "github_newdev",
      providerId: "github",
      host: "github.com",
      username: "newdev",
      displayName: "New Developer",
      email: "newdev@cloud.io",
      authType: "pat",
    });

    const result = await detector.detectAccess({
      url: "git@github.com:newdev/awesome-lib.git",
      targetPath: tempDir,
    });

    expect(result.matched).toBe(true);
    expect(result.identity).toBeDefined();
    expect(result.identity?.name).toBe("New Developer");
    expect(result.identity?.email).toBe("newdev@cloud.io");
  });

  it("returns unresolved gracefully for local bare repositories without crashing", async () => {
    const localBarePath = path.join(tempDir, "local-repo.git");
    fs.mkdirSync(localBarePath, { recursive: true });

    const result = await detector.detectAccess({
      url: localBarePath,
      targetPath: path.join(tempDir, "cloned"),
    });

    expect(result.matched).toBe(false);
    expect(result.tier).toBe("unresolved");
  });
});
