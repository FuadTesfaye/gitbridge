import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { SecurityAuditor } from "@/cli/commands/security";
import { IdentityGuard } from "@/core/safety/identity-guard";
import { isWindows } from "@/utils/platform";

describe("SecurityAuditor & Safety Guard Hooks", () => {
  let tempDir: string;
  let store: ConfigStore;
  let auditor: SecurityAuditor;
  let guard: IdentityGuard;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gb-sec-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    auditor = new SecurityAuditor(store);
    guard = new IdentityGuard(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("audits and fixes overly permissive file permissions on POSIX", () => {
    if (isWindows()) return; // POSIX chmod tests

    store.ensureDirectories();
    const configFile = store.getPathResolver().getConfigFile();
    fs.writeFileSync(configFile, JSON.stringify({ enabled: true }), { mode: 0o644 });

    // Should detect 0644 as issue (expected 0600)
    const issues = auditor.auditPermissions();
    expect(issues.some((i) => i.path === configFile)).toBe(true);

    // Fix permissions
    const fixResult = auditor.fixPermissions();
    expect(fixResult.fixed).toContain(configFile);

    // Now audit should be clean for configFile
    const reaudit = auditor.auditPermissions();
    expect(reaudit.some((i) => i.path === configFile)).toBe(false);

    const stat = fs.statSync(configFile);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("installs and uninstalls pre-push hooks cleanly", async () => {
    const mockRepo = path.join(tempDir, "test-repo");
    fs.mkdirSync(mockRepo, { recursive: true });

    // Init git repo
    const proc = Bun.spawn(["git", "init"], { cwd: mockRepo });
    await proc.exited;

    const pushInstalled = await guard.installPrePushHook(mockRepo);
    expect(pushInstalled).toBe(true);
    expect(guard.isPrePushInstalled(mockRepo)).toBe(true);

    const hookFile = path.join(mockRepo, ".git", "hooks", "pre-push");
    expect(fs.existsSync(hookFile)).toBe(true);
    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content).toContain("gitbridge hook pre-push");

    const pushUninstalled = await guard.uninstallPrePushHook(mockRepo);
    expect(pushUninstalled).toBe(true);
    expect(guard.isPrePushInstalled(mockRepo)).toBe(false);
    expect(fs.existsSync(hookFile)).toBe(false);
  });
});
