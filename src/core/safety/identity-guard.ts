import fs from "node:fs";
import path from "node:path";
import { GitCli } from "../git/git-cli";
import { IdentityResolver, type ResolvedContext } from "../identity/identity-resolver";
import { ConfigStore } from "../config/config-store";

export interface GuardCheckResult {
  allowed: boolean;
  expectedEmail: string | null;
  currentEmail: string | null;
  message?: string;
}

export class IdentityGuard {
  private store: ConfigStore;
  private resolver: IdentityResolver;

  constructor(store: ConfigStore) {
    this.store = store;
    this.resolver = new IdentityResolver(store);
  }

  async check(cwd: string = process.cwd()): Promise<GuardCheckResult> {
    const ctx: ResolvedContext = await this.resolver.resolve(cwd);

    if (!ctx.isGitRepo) {
      return { allowed: true, expectedEmail: null, currentEmail: null };
    }

    const expectedEmail = ctx.identity?.email || null;
    const currentEmail = ctx.localGitEmail || null;

    if (expectedEmail && currentEmail && expectedEmail !== currentEmail) {
      return {
        allowed: false,
        expectedEmail,
        currentEmail,
        message: `Mismatched Git commit identity! Current: '${currentEmail}', Expected: '${expectedEmail}' (${ctx.identity?.name}).`,
      };
    }

    return {
      allowed: true,
      expectedEmail,
      currentEmail,
    };
  }

  isInstalled(repoPath: string): boolean {
    const hookFile = path.join(repoPath, ".git", "hooks", "pre-commit");
    if (!fs.existsSync(hookFile)) return false;
    const content = fs.readFileSync(hookFile, "utf-8");
    return content.includes("gitbridge hook pre-commit") || content.includes("gb hook pre-commit");
  }

  async install(repoPath: string): Promise<boolean> {
    return this.installPreCommitHook(repoPath);
  }

  async uninstall(repoPath: string): Promise<boolean> {
    return this.uninstallPreCommitHook(repoPath);
  }

  async installPreCommitHook(repoPath: string): Promise<boolean> {
    const git = new GitCli(repoPath);
    const root = await git.getRepoRoot();
    if (!root) return false;

    const hooksDir = path.join(root, ".git", "hooks");
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    const hookFile = path.join(hooksDir, "pre-commit");

    const hookScript = `#!/usr/bin/env bash
# GitBridge Pre-Commit Identity Guard
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

  async uninstallPreCommitHook(repoPath: string): Promise<boolean> {
    const git = new GitCli(repoPath);
    const root = await git.getRepoRoot();
    if (!root) return false;

    const hookFile = path.join(root, ".git", "hooks", "pre-commit");
    if (!fs.existsSync(hookFile)) return true;

    const content = fs.readFileSync(hookFile, "utf-8");
    if (content.includes("GitBridge Pre-Commit Identity Guard") || content.includes("gitbridge hook pre-commit")) {
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
