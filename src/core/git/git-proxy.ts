import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ConfigStore, defaultConfigStore } from "../config/config-store";
import { GitOverrideManager } from "./override-manager";
import { IdentityResolver } from "../identity/identity-resolver";
import { IdentityGuard } from "../safety/identity-guard";
import { logger } from "@/utils/logger";

export interface ProxyExecutionResult {
  exitCode: number;
  subcommand?: string;
  injectedIdentity?: string;
}

export class GitProxy {
  private store: ConfigStore;
  private overrideManager: GitOverrideManager;
  private resolver: IdentityResolver;
  private guard: IdentityGuard;

  constructor(store: ConfigStore = defaultConfigStore) {
    this.store = store;
    this.overrideManager = new GitOverrideManager(store);
    this.resolver = new IdentityResolver(store);
    this.guard = new IdentityGuard(store);
  }

  /**
   * Parses git CLI arguments to find the target working directory and the primary git subcommand.
   */
  parseGitArgs(args: string[]): { cwd: string; subcommand: string | null; subcmdIndex: number } {
    let cwd = process.cwd();
    let subcommand: string | null = null;
    let subcmdIndex = -1;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === "-C" && i + 1 < args.length) {
        cwd = path.resolve(cwd, args[i + 1]);
        i++; // skip next arg
        continue;
      }

      if (arg.startsWith("-C")) {
        const pathPart = arg.slice(2);
        if (pathPart) {
          cwd = path.resolve(cwd, pathPart);
        }
        continue;
      }

      if (arg === "-c" && i + 1 < args.length) {
        i++; // skip next arg
        continue;
      }

      if (arg.startsWith("--git-dir=") || arg.startsWith("--work-tree=")) {
        continue;
      }

      if (arg.startsWith("-")) {
        continue;
      }

      // First non-option argument is the git subcommand
      subcommand = arg;
      subcmdIndex = i;
      break;
    }

    return { cwd, subcommand, subcmdIndex };
  }

  /**
   * Executes git proxy logic and spawns the real git binary.
   */
  async execute(args: string[]): Promise<number> {
    // 1. Check if user ran `git bridge ...` or `git gb ...`
    if (args.length > 0 && (args[0] === "bridge" || args[0] === "gb")) {
      const { createProgram } = await import("@/cli");
      const subArgs = args.slice(1);
      const program = createProgram(args[0] === "gb" ? "gb" : "git bridge");
      try {
        await program.parseAsync(["node", args[0], ...subArgs]);
        return 0;
      } catch (err: unknown) {
        console.error(pc.red("Error:"), err instanceof Error ? err.message : String(err));
        return 1;
      }
    }

    // 2. Discover real git binary
    const realGit = this.overrideManager.findRealGitPath() || (process.platform === "win32" ? "git.exe" : "/usr/bin/git");
    const { cwd, subcommand } = this.parseGitArgs(args);

    const injectedEnv: Record<string, string> = {
      GITBRIDGE_OVERRIDE_BYPASS: "1",
      GITBRIDGE_REAL_GIT: realGit,
    };

    const isEnabled = this.store.isOverrideEnabled();
    const config = this.store.loadConfig();

    // 3. If override is enabled, inject context
    if (isEnabled && subcommand) {
      const commitCommands = ["commit", "merge", "rebase", "cherry-pick", "am"];
      const networkCommands = ["push", "pull", "fetch", "clone", "ls-remote"];

      if (commitCommands.includes(subcommand)) {
        try {
          const ctx = await this.resolver.resolve(cwd);
          if (ctx.identity) {
            injectedEnv.GIT_AUTHOR_NAME = ctx.identity.name;
            injectedEnv.GIT_AUTHOR_EMAIL = ctx.identity.email;
            injectedEnv.GIT_COMMITTER_NAME = ctx.identity.name;
            injectedEnv.GIT_COMMITTER_EMAIL = ctx.identity.email;

            // Commit Identity Safety check for `git commit`
            if (subcommand === "commit" && config.settings.commitIdentitySafety && ctx.isGitRepo) {
              const guardResult = await this.guard.check(cwd);
              if (!guardResult.allowed) {
                logger.warn(`\n[GitBridge Safety Warning] ${guardResult.message}`);
                logger.warn(`Auto-applying verified GitBridge identity: ${pc.cyan(ctx.identity.name)} <${pc.cyan(ctx.identity.email)}>\n`);
              }
            }
          }
        } catch {
          // Fall through gracefully if context resolution encounters an error
        }
      }

      if (networkCommands.includes(subcommand)) {
        try {
          const ctx = await this.resolver.resolve(cwd);
          if (ctx.account && ctx.account.sshKeyPath && fs.existsSync(ctx.account.sshKeyPath)) {
            injectedEnv.GIT_SSH_COMMAND = `ssh -i "${ctx.account.sshKeyPath}" -o IdentitiesOnly=yes`;
          }
        } catch {
          // Fall through gracefully
        }
      }
    }

    // 4. Spawn real git binary with inherited stdio
    try {
      const result = child_process.spawnSync(realGit, args, {
        cwd,
        stdio: "inherit",
        env: {
          ...process.env,
          ...injectedEnv,
        },
      });

      if (result.error) {
        console.error(pc.red(`Failed to execute git: ${result.error.message}`));
        return 1;
      }

      return result.status ?? 0;
    } catch (err: unknown) {
      console.error(pc.red(`Git execution error: ${err instanceof Error ? err.message : String(err)}`));
      return 1;
    }
  }
}
