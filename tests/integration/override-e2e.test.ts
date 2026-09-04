import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitOverrideManager } from "@/core/git/override-manager";
import { GitProxy } from "@/core/git/git-proxy";
import { GitCli } from "@/core/git/git-cli";

describe("Git Override End-to-End Integration", () => {
  let tempDir: string;
  let workDir: string;
  let store: ConfigStore;
  let overrideManager: GitOverrideManager;
  let proxy: GitProxy;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gitbridge-override-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    workDir = path.join(tempDir, "work-projects", "api-service");
    fs.mkdirSync(workDir, { recursive: true });

    const paths = new PathResolver(path.join(tempDir, ".gitbridge"));
    store = new ConfigStore(paths);
    overrideManager = new GitOverrideManager(store);
    proxy = new GitProxy(store);

    // Initialize Git in workDir
    const git = new GitCli(workDir);
    await git.exec(["init"]);
    await git.exec(["config", "user.name", "Initial Name"]);
    await git.exec(["config", "user.email", "initial@domain.com"]);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("automatically routes commit identities through git-proxy based on directory rules", async () => {
    // 1. Setup Identities
    store.addIdentity({ id: "personal", name: "Alice Personal", email: "alice@personal.dev" });
    store.addIdentity({ id: "work", name: "Alice WorkCorp", email: "alice@workcorp.com" });

    // 2. Setup Directory Rule for ~/work-projects
    store.addRule({
      id: "work-rule",
      path: path.join(tempDir, "work-projects"),
      identityId: "work",
    });

    // 3. Enable Override
    overrideManager.enable();
    expect(store.isOverrideEnabled()).toBe(true);

    const git = new GitCli(workDir);

    // 4. Stage a file
    const readmePath = path.join(workDir, "README.md");
    fs.writeFileSync(readmePath, "# Work API\nManaged by GitBridge\n");
    await git.exec(["add", "README.md"]);

    // 5. Execute commit through GitProxy
    const exitCode = await proxy.execute(["-C", workDir, "commit", "-m", "feat: initial work commit"]);
    expect(exitCode).toBe(0);

    // 6. Verify Git commit log reflects the WorkCorp identity injected by GitBridge
    const logRes = await git.exec(["log", "-1", "--format=%an <%ae>"]);
    expect(logRes.stdout).toBe("Alice WorkCorp <alice@workcorp.com>");

    // 7. Verify Disable
    overrideManager.disable();
    expect(store.isOverrideEnabled()).toBe(false);
    expect(overrideManager.getOverrideStatus().shimsInstalled).toBe(false);
    expect(fs.existsSync(store.getPathResolver().getOverrideActiveFile())).toBe(false);

    // 8. Commit while override is disabled should NOT inject identity, using native git config
    fs.writeFileSync(readmePath, "# Work API\nNative commit without GitBridge injection\n");
    await git.exec(["add", "README.md"]);
    const exitCodeDisabled = await proxy.execute(["-C", workDir, "commit", "-m", "feat: second native commit"]);
    expect(exitCodeDisabled).toBe(0);

    const secondLog = await git.exec(["log", "-1", "--format=%an <%ae>"]);
    // Since override is disabled, it preserved the local git repo's native author!
    expect(secondLog.stdout).toBe("Initial Name <initial@domain.com>");
  });

  it("shim script directly executes real git when override is inactive", async () => {
    // 1. Install shim with override disabled
    const realGit = overrideManager.findRealGitPath() || "/usr/bin/git";
    overrideManager.installShims(realGit);
    const shimPath = store.getPathResolver().getGitShimPath();
    expect(fs.existsSync(shimPath)).toBe(true);
    expect(store.isOverrideEnabled()).toBe(false);
    expect(fs.existsSync(store.getPathResolver().getOverrideActiveFile())).toBe(false);

    // 2. Invoking the shim directly when override.active does NOT exist must run real git immediately
    const res = Bun.spawnSync([shimPath, "config", "user.name"], {
      cwd: workDir,
      env: {
        ...process.env,
        GITBRIDGE_HOME: store.getPathResolver().getBaseDir(),
      },
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout.toString().trim()).toBe("Initial Name");

    // 3. Uninstalling shims cleans up all files
    overrideManager.uninstallShims();
    expect(fs.existsSync(shimPath)).toBe(false);
  });
});
