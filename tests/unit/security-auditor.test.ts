import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import {
  SecurityAuditor,
  handleSecurityCheck,
  handleSecurityFix,
  handleSecurityScan,
} from "@/cli/commands/security";
import { GitCli } from "@/core/git/git-cli";

describe("SecurityAuditor & Commands Unit Tests", () => {
  let tempDir: string;
  let gbHome: string;
  let store: ConfigStore;
  let auditor: SecurityAuditor;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gb-sec-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    gbHome = path.join(tempDir, ".gitbridge");
    fs.mkdirSync(gbHome, { recursive: true });

    const paths = new PathResolver(gbHome);
    store = new ConfigStore(paths);
    auditor = new SecurityAuditor(store);

    // Initialize store with dummy config
    store.saveConfig({ enabled: true, version: "1.0.0", providers: {}, customProviders: [], rules: [], settings: {} as any });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("audits directory and file permissions and fixes them to 0700/0600", () => {
    if (process.platform === "win32") return; // POSIX permissions test

    const paths = store.getPathResolver();
    const testFile = paths.getConfigFile();
    if (fs.existsSync(testFile)) {
      fs.chmodSync(testFile, 0o666); // loose permissions
    }

    const issues = auditor.auditPermissions();
    expect(issues.length).toBeGreaterThanOrEqual(1);

    const fixResult = auditor.fixPermissions();
    expect(fixResult.fixed.length).toBeGreaterThanOrEqual(1);

    const remaining = auditor.auditPermissions();
    expect(remaining.length).toBe(0);
  });

  it("handles security check and scan workflows cleanly without throwing", async () => {
    const git = new GitCli(tempDir);
    await git.exec(["init"]);
    await git.exec(["config", "user.name", "Security Tester"]);
    await git.exec(["config", "user.email", "sec@test.com"]);

    // Run security check
    await handleSecurityCheck(tempDir, store);

    // Run security fix
    await handleSecurityFix(tempDir, store);

    // Run security scan on directory
    await handleSecurityScan(tempDir);
  });
});
