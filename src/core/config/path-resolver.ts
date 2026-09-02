import path from "node:path";
import { getHomeDir, expandTilde } from "@/utils/platform";

export class PathResolver {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    if (customBaseDir) {
      this.baseDir = expandTilde(customBaseDir);
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

  getUserGitConfigFile(): string {
    return path.join(getHomeDir(), ".gitconfig");
  }

  getUserSshConfigFile(): string {
    return path.join(getHomeDir(), ".ssh", "config");
  }

  getUserSshDir(): string {
    return path.join(getHomeDir(), ".ssh");
  }
}

export const defaultPathResolver = new PathResolver();
