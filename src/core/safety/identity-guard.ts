import fs from "node:fs";
import path from "node:path";
import { GitCli } from "../git/git-cli";
import { IdentityResolver, type ResolvedContext } from "../identity/identity-resolver";
import { ConfigStore } from "../config/config-store";
import { SecretScanner, type StagedSecretViolation, type RemoteCredentialViolation } from "./secret-scanner";

export interface GuardCheckResult {
  allowed: boolean;
  expectedEmail: string | null;
  currentEmail: string | null;
  message?: string;
  violations?: StagedSecretViolation[];
  remoteViolations?: RemoteCredentialViolation[];
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
    const git = new GitCli(repoPath);
    const root = await git.getRepoRoot();
    if (!root) return false;

    const hooksDir = path.join(root, ".git", "hooks");
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true, mode: 0o755 });
    }

    const hookFile = path.join(hooksDir, "pre-commit");
    const hookScript = `#!/usr/bin/env bash
# GitBridge Pre-Commit Identity Guard & Secret Scanner
if command -v gitbridge >/dev/null 2>&1; then
    gitbridge hook pre-commit
elif command -v gb >/dev/null 2>&1; then
    gb hook pre-commit
fi
`;

    if (fs.existsSync(hookFile)) {
      const existing = fs.readFileSync(hookFile, "utf-8");
      if (!existing.includes("gitbridge hook pre-commit")) {
        fs.appendFileSync(hookFile, `\n${hookScript}\n`, { mode: 0o755 });
      }
    } else {
      fs.writeFileSync(hookFile, hookScript, { encoding: "utf-8", mode: 0o755 });
    }

    return true;
  }

  async installPrePushHook(repoPath: string): Promise<boolean> {
    const git = new GitCli(repoPath);
    const root = await git.getRepoRoot();
    if (!root) return false;

    const hooksDir = path.join(root, ".git", "hooks");
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true, mode: 0o755 });
    }

    const hookFile = path.join(hooksDir, "pre-push");
    const hookScript = `#!/usr/bin/env bash
# GitBridge Pre-Push Identity & Safety Guard
if command -v gitbridge >/dev/null 2>&1; then
    gitbridge hook pre-push
elif command -v gb >/dev/null 2>&1; then
    gb hook pre-push
fi
`;

    if (fs.existsSync(hookFile)) {
      const existing = fs.readFileSync(hookFile, "utf-8");
      if (!existing.includes("gitbridge hook pre-push")) {
        fs.appendFileSync(hookFile, `\n${hookScript}\n`, { mode: 0o755 });
      }
    } else {
      fs.writeFileSync(hookFile, hookScript, { encoding: "utf-8", mode: 0o755 });
    }

    return true;
  }

  async uninstallPreCommitHook(repoPath: string): Promise<boolean> {
    const git = new GitCli(repoPath);
    const root = await git.getRepoRoot();
    if (!root) return false;

    const hookFile = path.join(root, ".git", "hooks", "pre-commit");
    if (!fs.existsSync(hookFile)) return true;

    const content = fs.readFileSync(hookFile, "utf-8");
    if (content.includes("gitbridge hook pre-commit") || content.includes("gb hook pre-commit")) {
      const nonCommentLines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));

      const isOnlyGitBridge = nonCommentLines.every(
        (l) =>
          l.startsWith("if ") ||
          l.startsWith("elif ") ||
          l === "fi" ||
          l.includes("gitbridge") ||
          l.includes("gb hook")
      );

      if (isOnlyGitBridge) {
        fs.unlinkSync(hookFile);
      } else {
        const filtered = content
          .split("\n")
          .filter(
            (l) =>
              !l.includes("GitBridge") &&
              !l.includes("gitbridge hook") &&
              !l.includes("gb hook") &&
              !l.includes("command -v gitbridge") &&
              !l.includes("command -v gb")
          )
          .join("\n")
          .trim();
        fs.writeFileSync(hookFile, `${filtered}\n`, { encoding: "utf-8", mode: 0o755 });
      }
    }

    return true;
  }

  async uninstallPrePushHook(repoPath: string): Promise<boolean> {
    const git = new GitCli(repoPath);
    const root = await git.getRepoRoot();
    if (!root) return false;

    const hookFile = path.join(root, ".git", "hooks", "pre-push");
    if (!fs.existsSync(hookFile)) return true;

    const content = fs.readFileSync(hookFile, "utf-8");
    if (content.includes("gitbridge hook pre-push") || content.includes("gb hook pre-push")) {
      const nonCommentLines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));

      const isOnlyGitBridge = nonCommentLines.every(
        (l) =>
          l.startsWith("if ") ||
          l.startsWith("elif ") ||
          l === "fi" ||
          l.includes("gitbridge") ||
          l.includes("gb hook")
      );

      if (isOnlyGitBridge) {
        fs.unlinkSync(hookFile);
      } else {
        const filtered = content
          .split("\n")
          .filter(
            (l) =>
              !l.includes("GitBridge") &&
              !l.includes("gitbridge hook") &&
              !l.includes("gb hook") &&
              !l.includes("command -v gitbridge") &&
              !l.includes("command -v gb")
          )
          .join("\n")
          .trim();
        fs.writeFileSync(hookFile, `${filtered}\n`, { encoding: "utf-8", mode: 0o755 });
      }
    }

    return true;
  }
}
