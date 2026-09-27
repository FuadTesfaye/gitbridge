import fs from "node:fs";
import path from "node:path";
import { GitCli } from "../git/git-cli";
import { IdentityResolver, type ResolvedContext } from "../identity/identity-resolver";
import { ConfigStore } from "../config/config-store";
import { SecretScanner, type StagedSecretViolation, type RemoteCredentialViolation } from "./secret-scanner";
import { replaceManagedBlock } from "@/utils/managed-block";
import { logger } from "@/utils/logger";

export interface GuardCheckResult {
  allowed: boolean;
  expectedEmail: string | null;
  currentEmail: string | null;
  message?: string;
  violations?: StagedSecretViolation[];
  remoteViolations?: RemoteCredentialViolation[];
}

export type HookType = "pre-commit" | "pre-push";

export const HOOK_BLOCK_START = "# --- BEGIN GITBRIDGE HOOK ---";
export const HOOK_BLOCK_END = "# --- END GITBRIDGE HOOK ---";

/** Interpreters a POSIX shell block can safely be prepended to. */
const SHELL_SHEBANG = /^#!\s*(?:\S*\/)?(?:env\s+)?(?:sh|bash|zsh|dash|ksh|ash)\b/;

function hookMarker(hookType: HookType): string {
  return `# gitbridge hook ${hookType}`;
}

function hookTitle(hookType: HookType): string {
  return hookType === "pre-commit"
    ? "GitBridge Pre-Commit Identity Guard & Secret Scanner"
    : "GitBridge Pre-Push Identity & Safety Guard";
}

/**
 * The managed block written into .git/hooks/<hookType>.
 *
 * It never `exec`s: when it is prepended to a hook the user already had, that
 * hook keeps running once GitBridge's checks pass. A failing check exits with
 * the guard's status. GITBRIDGE_HOOK_BYPASS=1 skips the block entirely.
 */
export function buildHookBlock(hookType: HookType): string {
  const verb = hookType === "pre-commit" ? "commit" : "push";
  return [
    HOOK_BLOCK_START,
    `# ${hookTitle(hookType)}`,
    `# Managed by GitBridge: edits inside this block are overwritten on reinstall.`,
    hookMarker(hookType),
    `if [ "\${GITBRIDGE_HOOK_BYPASS:-}" != "1" ]; then`,
    `    GB=""`,
    `    if command -v gitbridge >/dev/null 2>&1; then`,
    `        GB="$(command -v gitbridge)"`,
    `    elif command -v gb >/dev/null 2>&1; then`,
    `        GB="$(command -v gb)"`,
    `    fi`,
    `    if [ -z "$GB" ]; then`,
    `        echo "GitBridge: gitbridge CLI not found on PATH; refusing to ${verb}." >&2`,
    `        echo "Install GitBridge or set GITBRIDGE_HOOK_BYPASS=1 to skip (unsafe)." >&2`,
    `        exit 1`,
    `    fi`,
    `    "$GB" hook ${hookType} || exit $?`,
    `fi`,
    HOOK_BLOCK_END,
  ].join("\n");
}

/**
 * Hook scripts written by GitBridge before managed blocks existed (v0.1.0 to
 * v0.2.9). They are matched byte-for-byte so that migrating or removing them
 * never has to guess which lines belong to GitBridge and which to the user.
 * @internal exported for tests
 */
export function legacyHookScripts(hookType: HookType): string[] {
  const verb = hookType === "pre-commit" ? "commit" : "push";
  const titles =
    hookType === "pre-commit"
      ? ["GitBridge Pre-Commit Identity Guard & Secret Scanner", "GitBridge Pre-Commit Identity Guard"]
      : ["GitBridge Pre-Push Identity & Safety Guard"];

  const scripts: string[] = [];
  for (const title of titles) {
    // v0.2.5 - v0.2.9
    scripts.push(`#!/usr/bin/env bash
# ${title}
if [ "\${GITBRIDGE_HOOK_BYPASS:-}" = "1" ]; then
    exit 0
fi
GB=""
if command -v gitbridge >/dev/null 2>&1; then
    GB="$(command -v gitbridge)"
elif command -v gb >/dev/null 2>&1; then
    GB="$(command -v gb)"
else
    echo "GitBridge: gitbridge CLI not found on PATH; refusing to ${verb}." >&2
    echo "Install GitBridge or set GITBRIDGE_HOOK_BYPASS=1 to skip (unsafe)." >&2
    exit 1
fi
# gitbridge hook ${hookType}
exec "$GB" hook ${hookType}
`);
    // v0.1.0 - v0.2.4
    scripts.push(`#!/usr/bin/env bash
# ${title}
if command -v gitbridge >/dev/null 2>&1; then
    gitbridge hook ${hookType}
elif command -v gb >/dev/null 2>&1; then
    gb hook ${hookType}
fi
`);
  }
  return scripts;
}

/**
 * Removes a legacy GitBridge hook script from `content`. Older versions either
 * wrote the script as the whole file or appended it (shebang included) to an
 * existing hook. Returns null when the GitBridge part was edited by hand and
 * therefore cannot be identified with certainty.
 */
function stripLegacyHookScript(content: string, hookType: HookType): string | null {
  for (const legacy of legacyHookScripts(hookType)) {
    if (content === legacy) return "";
    const appended = `\n${legacy}\n`;
    if (content.includes(appended)) return content.replace(appended, "");
    if (content.includes(legacy)) return content.replace(legacy, "");
  }
  return null;
}

/** Removes the managed block and the newline that followed it. Null when the markers are unpaired. */
function removeHookBlock(content: string): string | null {
  const start = content.indexOf(HOOK_BLOCK_START);
  if (start === -1) return content;
  const end = content.indexOf(HOOK_BLOCK_END, start + HOOK_BLOCK_START.length);
  if (end === -1) return null;
  let after = content.slice(end + HOOK_BLOCK_END.length);
  if (after.startsWith("\n")) after = after.slice(1);
  return content.slice(0, start) + after;
}

function isBlankOrShebangOnly(content: string): boolean {
  const meaningful = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return meaningful.length === 0 || (meaningful.length === 1 && meaningful[0].startsWith("#!"));
}

function isShellScript(content: string): boolean {
  const firstLine = content.split("\n")[0] ?? "";
  // No interpreter line: git runs the hook through sh.
  if (!firstLine.startsWith("#!")) return true;
  return SHELL_SHEBANG.test(firstLine);
}

function insertAfterShebang(content: string, block: string): string {
  const lines = content.split("\n");
  if (lines[0]?.startsWith("#!")) {
    return [lines[0], block, ...lines.slice(1)].join("\n");
  }
  return `${block}\n${content}`;
}

export class IdentityGuard {
  private store: ConfigStore;
  private resolver: IdentityResolver;
  private scanner: SecretScanner;

  constructor(store: ConfigStore) {
    this.store = store;
    this.resolver = new IdentityResolver(store);
    this.scanner = new SecretScanner();
  }

  getSecretScanner(): SecretScanner {
    return this.scanner;
  }

  async check(cwd: string = process.cwd(), operation: "commit" | "push" = "commit"): Promise<GuardCheckResult> {
    const ctx: ResolvedContext = await this.resolver.resolve(cwd);

    if (!ctx.isGitRepo) {
      return { allowed: true, expectedEmail: null, currentEmail: null };
    }

    const expectedEmail = ctx.identity?.email || null;
    const currentEmail = ctx.localGitEmail || null;

    // 1. Check Identity Match
    if (expectedEmail && currentEmail && expectedEmail !== currentEmail) {
      return {
        allowed: false,
        expectedEmail,
        currentEmail,
        message: `Mismatched Git commit identity! Current: '${currentEmail}', Expected: '${expectedEmail}' (${ctx.identity?.name}).`,
      };
    }

    // 2. If Commit, scan staged files for secrets & private keys
    if (operation === "commit") {
      const stagedViolations = await this.scanner.scanStagedFiles(cwd);
      if (stagedViolations.length > 0) {
        return {
          allowed: false,
          expectedEmail,
          currentEmail,
          violations: stagedViolations,
          message: `Detected sensitive credentials or private keys staged for commit in ${stagedViolations.length} file(s)!`,
        };
      }
    }

    // 3. If Push, check remotes for plaintext tokens or account mismatches
    if (operation === "push") {
      const remoteViolations = await this.scanner.scanRemotes(cwd);
      if (remoteViolations.length > 0) {
        return {
          allowed: false,
          expectedEmail,
          currentEmail,
          remoteViolations,
          message: `Detected plaintext credentials embedded in Git remote URLs! Push blocked for safety.`,
        };
      }
    }

    return {
      allowed: true,
      expectedEmail,
      currentEmail,
    };
  }

  isInstalled(repoPath: string): boolean {
    return this.isPreCommitInstalled(repoPath);
  }

  isPreCommitInstalled(repoPath: string): boolean {
    const hookFile = path.join(repoPath, ".git", "hooks", "pre-commit");
    if (!fs.existsSync(hookFile)) return false;
    const content = fs.readFileSync(hookFile, "utf-8");
    return content.includes("gitbridge hook pre-commit") || content.includes("gb hook pre-commit");
  }

  isPrePushInstalled(repoPath: string): boolean {
    const hookFile = path.join(repoPath, ".git", "hooks", "pre-push");
    if (!fs.existsSync(hookFile)) return false;
    const content = fs.readFileSync(hookFile, "utf-8");
    return content.includes("gitbridge hook pre-push") || content.includes("gb hook pre-push");
  }

  async install(repoPath: string): Promise<boolean> {
    const c = await this.installPreCommitHook(repoPath);
    const p = await this.installPrePushHook(repoPath);
    return c && p;
  }

  async uninstall(repoPath: string): Promise<boolean> {
    const c = await this.uninstallPreCommitHook(repoPath);
    const p = await this.uninstallPrePushHook(repoPath);
    return c && p;
  }

  async installPreCommitHook(repoPath: string): Promise<boolean> {
    return this.installHook(repoPath, "pre-commit");
  }

  async installPrePushHook(repoPath: string): Promise<boolean> {
    return this.installHook(repoPath, "pre-push");
  }

  async uninstallPreCommitHook(repoPath: string): Promise<boolean> {
    return this.uninstallHook(repoPath, "pre-commit");
  }

  async uninstallPrePushHook(repoPath: string): Promise<boolean> {
    return this.uninstallHook(repoPath, "pre-push");
  }

  private async resolveHookFile(repoPath: string, hookType: HookType): Promise<string | null> {
    const git = new GitCli(repoPath);
    const root = await git.getRepoRoot();
    if (!root) return null;
    return path.join(root, ".git", "hooks", hookType);
  }

  /**
   * Installs the managed block. A hook that already exists is kept: the block
   * is inserted after its shebang and the original script runs after the
   * GitBridge checks. Hooks that are not POSIX shell scripts are left alone,
   * as are hand-edited scripts from older GitBridge versions.
   */
  async installHook(repoPath: string, hookType: HookType): Promise<boolean> {
    const hookFile = await this.resolveHookFile(repoPath, hookType);
    if (!hookFile) return false;

    const hooksDir = path.dirname(hookFile);
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true, mode: 0o755 });
    }

    const block = buildHookBlock(hookType);
    const standalone = `#!/usr/bin/env bash\n${block}\n`;
    let content: string;

    if (!fs.existsSync(hookFile)) {
      content = standalone;
    } else {
      const existing = fs.readFileSync(hookFile, "utf-8");

      if (existing.includes(HOOK_BLOCK_START)) {
        const replaced = replaceManagedBlock(existing, HOOK_BLOCK_START, HOOK_BLOCK_END, block);
        if (!replaced.ok || replaced.content === undefined) {
          logger.warn(`${hookFile}: ${replaced.reason}. Leaving the hook untouched.`);
          return false;
        }
        content = replaced.content;
      } else {
        let remainder = existing;
        if (existing.includes(`gitbridge hook ${hookType}`)) {
          const stripped = stripLegacyHookScript(existing, hookType);
          if (stripped === null) {
            logger.warn(
              `${hookFile} contains a GitBridge hook from an older version that was edited by hand. Remove it manually and run the install again.`
            );
            return false;
          }
          remainder = stripped;
        }

        if (isBlankOrShebangOnly(remainder)) {
          content = standalone;
        } else if (!isShellScript(remainder)) {
          logger.warn(
            `${hookFile} is not a POSIX shell script, so GitBridge will not modify it. Run 'gb hook ${hookType}' from that hook yourself to keep the guard.`
          );
          return false;
        } else {
          content = insertAfterShebang(remainder, block);
        }
      }
    }

    if (!content.endsWith("\n")) content += "\n";
    fs.writeFileSync(hookFile, content, { encoding: "utf-8", mode: 0o755 });
    try {
      fs.chmodSync(hookFile, 0o755);
    } catch {
      // ignore on Windows
    }
    return true;
  }

  /**
   * Removes the managed block (or a byte-identical legacy script). Whatever
   * the user had around it is written back unchanged; an empty hook is deleted.
   */
  async uninstallHook(repoPath: string, hookType: HookType): Promise<boolean> {
    const hookFile = await this.resolveHookFile(repoPath, hookType);
    if (!hookFile) return false;
    if (!fs.existsSync(hookFile)) return true;

    const content = fs.readFileSync(hookFile, "utf-8");
    let remainder: string | null;

    if (content.includes(HOOK_BLOCK_START)) {
      remainder = removeHookBlock(content);
      if (remainder === null) {
        logger.warn(`${hookFile}: unpaired GitBridge hook markers. Leaving the hook untouched.`);
        return false;
      }
    } else if (content.includes(`gitbridge hook ${hookType}`)) {
      remainder = stripLegacyHookScript(content, hookType);
      if (remainder === null) {
        logger.warn(
          `${hookFile} contains a GitBridge hook from an older version that was edited by hand. Remove it manually.`
        );
        return false;
      }
    } else {
      return true;
    }

    if (isBlankOrShebangOnly(remainder)) {
      fs.unlinkSync(hookFile);
    } else {
      fs.writeFileSync(hookFile, remainder.endsWith("\n") ? remainder : `${remainder}\n`, {
        encoding: "utf-8",
        mode: 0o755,
      });
    }
    return true;
  }
}
