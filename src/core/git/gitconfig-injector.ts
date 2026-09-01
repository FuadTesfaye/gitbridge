import fs from "node:fs";
import path from "node:path";
import { ConfigStore } from "../config/config-store";
import { GitConfigGenerator } from "./config-generator";

export const GITCONFIG_BLOCK_START = "# --- BEGIN GITBRIDGE MANAGED BLOCK ---";
export const GITCONFIG_BLOCK_END = "# --- END GITBRIDGE MANAGED BLOCK ---";

export class GitConfigInjector {
  private store: ConfigStore;

  constructor(store: ConfigStore) {
    this.store = store;
  }

  isInstalled(targetFile?: string): boolean {
    const gitConfigFile = targetFile || this.store.getPathResolver().getUserGitConfigFile();
    if (!fs.existsSync(gitConfigFile)) return false;
    const content = fs.readFileSync(gitConfigFile, "utf-8");
    return content.includes(GITCONFIG_BLOCK_START) && content.includes(GITCONFIG_BLOCK_END);
  }

  private createBackup(gitConfigFile: string): string | null {
    if (!fs.existsSync(gitConfigFile)) return null;

    const backupsDir = this.store.getPathResolver().getBackupsDir();
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupsDir, `gitconfig.${timestamp}.bak`);
    fs.copyFileSync(gitConfigFile, backupFile);

    // Also maintain primary .bak
    const primaryBak = `${gitConfigFile}.gitbridge.bak`;
    if (!fs.existsSync(primaryBak)) {
      fs.copyFileSync(gitConfigFile, primaryBak);
    }

    return backupFile;
  }

  inject(targetFile?: string): { success: boolean; backupPath: string | null } {
    const generator = new GitConfigGenerator(this.store);
    const { mainConfigPath } = generator.generate();

    const gitConfigFile = targetFile || this.store.getPathResolver().getUserGitConfigFile();
    const backupPath = this.createBackup(gitConfigFile);

    let originalContent = "";
    if (fs.existsSync(gitConfigFile)) {
      originalContent = fs.readFileSync(gitConfigFile, "utf-8");
    }

    const blockContent = [
      GITCONFIG_BLOCK_START,
      `# Do not edit this block directly. Manage via: gitbridge / gb`,
      `[include]`,
      `    path = ${mainConfigPath}`,
      GITCONFIG_BLOCK_END,
    ].join("\n");

    let newContent: string;

    if (originalContent.includes(GITCONFIG_BLOCK_START) && originalContent.includes(GITCONFIG_BLOCK_END)) {
      // Replace existing block
      const before = originalContent.substring(0, originalContent.indexOf(GITCONFIG_BLOCK_START));
      const after = originalContent.substring(originalContent.indexOf(GITCONFIG_BLOCK_END) + GITCONFIG_BLOCK_END.length);
      newContent = `${before.trimEnd()}\n\n${blockContent}\n\n${after.trimStart()}`.trim() + "\n";
    } else {
      // Append block
      newContent = `${originalContent.trimEnd()}\n\n${blockContent}\n`.trimStart();
    }

    fs.writeFileSync(gitConfigFile, newContent, { encoding: "utf-8", mode: 0o644 });
    return { success: true, backupPath };
  }

  remove(targetFile?: string): boolean {
    const gitConfigFile = targetFile || this.store.getPathResolver().getUserGitConfigFile();
    if (!fs.existsSync(gitConfigFile)) return true;

    const originalContent = fs.readFileSync(gitConfigFile, "utf-8");
    if (!originalContent.includes(GITCONFIG_BLOCK_START)) return true;

    const before = originalContent.substring(0, originalContent.indexOf(GITCONFIG_BLOCK_START));
    const after = originalContent.substring(originalContent.indexOf(GITCONFIG_BLOCK_END) + GITCONFIG_BLOCK_END.length);
    const cleaned = `${before.trimEnd()}\n${after.trimStart()}`.trim();

    if (cleaned.length === 0) {
      // If the file only contained the GitBridge block, we can either empty it or remove it
      fs.writeFileSync(gitConfigFile, "", { encoding: "utf-8", mode: 0o644 });
    } else {
      fs.writeFileSync(gitConfigFile, `${cleaned}\n`, { encoding: "utf-8", mode: 0o644 });
    }

    return true;
  }
}
