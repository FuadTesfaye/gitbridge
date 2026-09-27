import path from "node:path";
import { getHomeDir, expandTilde } from "@/utils/platform";

/**
 * Resolves every filesystem location GitBridge reads or writes.
 *
 * `customBaseDir` overrides the GitBridge config directory. `homeDir` overrides
 * the user's home directory, which is where ~/.gitconfig, ~/.ssh, shell
 * profiles and IDE settings live. Tests and embedders pass a sandbox home so
 * nothing outside it is ever touched. The CLI passes neither and follows the
 * environment: GITBRIDGE_HOME, then XDG_CONFIG_HOME, then HOME.
 */
export class PathResolver {
  private baseDir: string;
  private homeDir: string | null;

  constructor(customBaseDir?: string, homeDir?: string) {
    this.homeDir = homeDir ? expandTilde(homeDir) : null;

    if (customBaseDir) {
      this.baseDir = expandTilde(customBaseDir);
    } else if (this.homeDir) {
      this.baseDir = path.join(this.homeDir, ".gitbridge");
    } else if (process.env.GITBRIDGE_HOME) {
      this.baseDir = expandTilde(process.env.GITBRIDGE_HOME);
    } else if (process.env.XDG_CONFIG_HOME) {
      this.baseDir = path.join(expandTilde(process.env.XDG_CONFIG_HOME), "gitbridge");
    } else {
      this.baseDir = path.join(getHomeDir(), ".gitbridge");
    }
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  /** Home directory used for ~/.gitconfig, ~/.ssh, shell profiles and IDE settings. */
  getHomeDir(): string {
    return this.homeDir ?? getHomeDir();
  }

  /** True when this resolver was built with an explicit (sandbox) home directory. */
  hasExplicitHomeDir(): boolean {
    return this.homeDir !== null;
  }

  /**
   * $XDG_CONFIG_HOME, or ~/.config. An explicit home directory always wins so
   * a sandboxed resolver can never reach the real editor or shell configs.
   */
  getUserConfigDir(): string {
    if (this.homeDir) {
      return path.join(this.homeDir, ".config");
    }
    if (process.env.XDG_CONFIG_HOME) {
      return expandTilde(process.env.XDG_CONFIG_HOME);
    }
    return path.join(getHomeDir(), ".config");
  }

  getConfigFile(): string {
    return path.join(this.baseDir, "config.json");
  }

  getIdentitiesFile(): string {
    return path.join(this.baseDir, "identities.json");
  }

  getAccountsFile(): string {
    return path.join(this.baseDir, "accounts.json");
  }

  getReposFile(): string {
    return path.join(this.baseDir, "repos.json");
  }

  getGeneratedDir(): string {
    return path.join(this.baseDir, "generated");
  }

  getMainGitConfigFile(): string {
    return path.join(this.getGeneratedDir(), "main.gitconfig");
  }

  getGeneratedSshConfigFile(): string {
    return path.join(this.getGeneratedDir(), "ssh_config");
  }

  getRulesDir(): string {
    return path.join(this.getGeneratedDir(), "rules");
  }

  getRuleGitConfigFile(ruleId: string): string {
    const sanitized = ruleId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.getRulesDir(), `${sanitized}.gitconfig`);
  }

  getBackupsDir(): string {
    return path.join(this.baseDir, "backups");
  }

  getShimsDir(): string {
    return path.join(this.baseDir, "shims");
  }

  getGitShimPath(): string {
    return path.join(this.getShimsDir(), process.platform === "win32" ? "git.cmd" : "git");
  }

  getEncryptedVaultFile(): string {
    return path.join(this.baseDir, "vault.enc");
  }

  getOverrideActiveFile(): string {
    return path.join(this.baseDir, "override.active");
  }

  getUserGitConfigFile(): string {
    return path.join(this.getHomeDir(), ".gitconfig");
  }

  getUserSshConfigFile(): string {
    return path.join(this.getHomeDir(), ".ssh", "config");
  }

  getUserSshDir(): string {
    return path.join(this.getHomeDir(), ".ssh");
  }
}

export const defaultPathResolver = new PathResolver();
