import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { GitCli } from "@/core/git/git-cli";
import {
  IdentityGuard,
  HOOK_BLOCK_START,
  HOOK_BLOCK_END,
  buildHookBlock,
  legacyHookScripts,
} from "@/core/safety/identity-guard";

const isWindows = process.platform === "win32";

describe("IdentityGuard", () => {
  let tempDir: string;
  let store: ConfigStore;
  let guard: IdentityGuard;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-guard-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
    guard = new IdentityGuard(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function initRepo(name: string): Promise<{ repo: string; hookFile: string }> {
    const repo = path.join(tempDir, name);
    fs.mkdirSync(repo, { recursive: true });
    await new GitCli(repo).exec(["init"]);
    return { repo, hookFile: path.join(repo, ".git", "hooks", "pre-commit") };
  }

  /** Runs the hook script with a fake `gitbridge` on PATH that exits with `gbExit`. */
  function runHook(hookFile: string, gbExit: number | null, extraEnv: Record<string, string> = {}) {
    const fakeBin = path.join(tempDir, `fakebin-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(fakeBin, { recursive: true });
    if (gbExit !== null) {
      const fake = path.join(fakeBin, "gitbridge");
      fs.writeFileSync(fake, `#!/bin/sh\necho "fake gitbridge $*"\nexit ${gbExit}\n`, { mode: 0o755 });
    }
    const env: Record<string, string> = { ...(process.env as Record<string, string>), ...extraEnv };
    env.PATH = `${fakeBin}:/usr/bin:/bin`;
    const res = Bun.spawnSync([hookFile], { env, cwd: path.dirname(hookFile) });
    return { exitCode: res.exitCode, stdout: res.stdout.toString(), stderr: res.stderr.toString() };
  }

  it("installs a standalone managed hook and removes it completely", async () => {
    const { repo, hookFile } = await initRepo("my-repo");

    expect(await guard.installPreCommitHook(repo)).toBe(true);
    expect(fs.existsSync(hookFile)).toBe(true);
    expect(guard.isPreCommitInstalled(repo)).toBe(true);

    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(content).toContain(HOOK_BLOCK_START);
    expect(content).toContain(HOOK_BLOCK_END);
    expect(content).toContain("GitBridge Pre-Commit Identity Guard");
    expect(content).toContain("# gitbridge hook pre-commit");
    // The block chains instead of replacing the process
    expect(content).not.toContain('exec "$GB"');

    expect(await guard.uninstallPreCommitHook(repo)).toBe(true);
    expect(fs.existsSync(hookFile)).toBe(false);
    expect(guard.isPreCommitInstalled(repo)).toBe(false);
  });

  it("reinstalling replaces the block in place instead of stacking copies", async () => {
    const { repo, hookFile } = await initRepo("idempotent-repo");
    await guard.installPreCommitHook(repo);
    await guard.installPreCommitHook(repo);

    const content = fs.readFileSync(hookFile, "utf-8");
    expect(content.split(HOOK_BLOCK_START).length - 1).toBe(1);
    expect(content.split(HOOK_BLOCK_END).length - 1).toBe(1);
  });

  it("prepends its block to an existing shell hook and restores it byte-for-byte on uninstall", async () => {
    const { repo, hookFile } = await initRepo("custom-hook-repo");
    const original = "#!/bin/sh\n# user's own checks\necho custom hook ran\nexit 0\n";
    fs.writeFileSync(hookFile, original, { mode: 0o755 });

    expect(await guard.installPreCommitHook(repo)).toBe(true);

    const installed = fs.readFileSync(hookFile, "utf-8");
    expect(installed.startsWith(`#!/bin/sh\n${HOOK_BLOCK_START}`)).toBe(true);
    expect(installed).toContain("echo custom hook ran");
    expect(installed.split(HOOK_BLOCK_START).length - 1).toBe(1);
    expect(guard.isPreCommitInstalled(repo)).toBe(true);

    expect(await guard.uninstallPreCommitHook(repo)).toBe(true);
    expect(fs.readFileSync(hookFile, "utf-8")).toBe(original);
    expect(guard.isPreCommitInstalled(repo)).toBe(false);
  });

  it("keeps the user's hook running after the GitBridge checks pass, and stops it when they fail", async () => {
    if (isWindows) return;
    const { repo, hookFile } = await initRepo("chained-repo");
    fs.writeFileSync(hookFile, "#!/bin/sh\necho custom hook ran\nexit 0\n", { mode: 0o755 });
    await guard.installPreCommitHook(repo);

    // Guard passes: user's hook runs afterwards
    const pass = runHook(hookFile, 0);
    expect(pass.exitCode).toBe(0);
    expect(pass.stdout).toContain("fake gitbridge hook pre-commit");
    expect(pass.stdout).toContain("custom hook ran");

    // Guard fails: its exit status propagates and the user's hook never runs
    const fail = runHook(hookFile, 3);
    expect(fail.exitCode).toBe(3);
    expect(fail.stdout).not.toContain("custom hook ran");

    // No gitbridge on PATH: refuse
    const missing = runHook(hookFile, null);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("gitbridge CLI not found on PATH");

    // Bypass skips the block but still runs the user's hook
    const bypass = runHook(hookFile, null, { GITBRIDGE_HOOK_BYPASS: "1" });
    expect(bypass.exitCode).toBe(0);
    expect(bypass.stdout).toContain("custom hook ran");
  });

  it("refuses to modify a hook that is not a shell script", async () => {
    const { repo, hookFile } = await initRepo("python-hook-repo");
    const original = "#!/usr/bin/env python3\nprint('custom')\n";
    fs.writeFileSync(hookFile, original, { mode: 0o755 });

    expect(await guard.installPreCommitHook(repo)).toBe(false);
    expect(fs.readFileSync(hookFile, "utf-8")).toBe(original);
    expect(guard.isPreCommitInstalled(repo)).toBe(false);
  });

  it("migrates every hook layout written by older GitBridge versions", async () => {
    for (const legacy of legacyHookScripts("pre-commit")) {
      const { repo, hookFile } = await initRepo(`legacy-${Math.random().toString(36).slice(2, 7)}`);
      fs.writeFileSync(hookFile, legacy, { mode: 0o755 });
      expect(guard.isPreCommitInstalled(repo)).toBe(true);

      expect(await guard.installPreCommitHook(repo)).toBe(true);
      const migrated = fs.readFileSync(hookFile, "utf-8");
      expect(migrated).toContain(HOOK_BLOCK_START);
      expect(migrated).not.toContain('exec "$GB"');
      expect(migrated.split("#!/usr/bin/env bash").length - 1).toBe(1);

      expect(await guard.uninstallPreCommitHook(repo)).toBe(true);
      expect(fs.existsSync(hookFile)).toBe(false);
    }
  });

  it("migrates a legacy script that was appended to a user's hook, keeping the user's part", async () => {
    const { repo, hookFile } = await initRepo("legacy-appended-repo");
    const userPart = "#!/bin/sh\necho custom hook ran\n";
    const legacy = legacyHookScripts("pre-commit")[0];
    // This is exactly what installPreCommitHook() used to do to an existing hook
    fs.writeFileSync(hookFile, `${userPart}\n${legacy}\n`, { mode: 0o755 });

    expect(await guard.installPreCommitHook(repo)).toBe(true);
    const migrated = fs.readFileSync(hookFile, "utf-8");
    expect(migrated.startsWith(`#!/bin/sh\n${HOOK_BLOCK_START}`)).toBe(true);
    expect(migrated).toContain("echo custom hook ran");
    expect(migrated).not.toContain('exec "$GB"');

    expect(await guard.uninstallPreCommitHook(repo)).toBe(true);
    expect(fs.readFileSync(hookFile, "utf-8")).toBe(userPart);
  });

  it("leaves a hand-edited legacy hook alone rather than guessing which lines are GitBridge's", async () => {
    const { repo, hookFile } = await initRepo("legacy-edited-repo");
    const edited = legacyHookScripts("pre-commit")[0].replace('GB=""\n', 'GB=""\nexport MY_VAR=1\n');
    fs.writeFileSync(hookFile, edited, { mode: 0o755 });

    expect(await guard.installPreCommitHook(repo)).toBe(false);
    expect(fs.readFileSync(hookFile, "utf-8")).toBe(edited);
    expect(await guard.uninstallPreCommitHook(repo)).toBe(false);
    expect(fs.readFileSync(hookFile, "utf-8")).toBe(edited);
  });

  it("uninstall ignores hooks that were never GitBridge's", async () => {
    const { repo, hookFile } = await initRepo("foreign-repo");
    const original = "#!/bin/sh\necho not ours\n";
    fs.writeFileSync(hookFile, original, { mode: 0o755 });
    expect(await guard.uninstallPreCommitHook(repo)).toBe(true);
    expect(fs.readFileSync(hookFile, "utf-8")).toBe(original);
  });

  it("builds the same block shape for pre-push", () => {
    const block = buildHookBlock("pre-push");
    expect(block).toContain("GitBridge Pre-Push Identity & Safety Guard");
    expect(block).toContain('"$GB" hook pre-push || exit $?');
    expect(block).toContain("refusing to push");
  });
});
