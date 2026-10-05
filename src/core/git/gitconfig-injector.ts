import fs from "node:fs";
import path from "node:path";
import { ConfigStore } from "../config/config-store";
import { GitConfigGenerator } from "./config-generator";
import { replaceManagedBlock, removeManagedBlock } from "@/utils/managed-block";

export const GITCONFIG_BLOCK_START = "# --- BEGIN GITBRIDGE MANAGED BLOCK ---";
export const GITCONFIG_BLOCK_END = "# --- END GITBRIDGE MANAGED BLOCK ---";

export class GitConfigInjector {
  private store: ConfigStore;

  constructor(store: ConfigStore) {
    this.store = store;
  }

  /** Files to inspect: the explicit target, or every user git config git would read. */
  private candidateFiles(targetFile?: string): string[] {
    if (targetFile) return [targetFile];
    return this.store.getPathResolver().getUserGitConfigCandidates();
  }

  private hasBlock(file: string): boolean {
    if (!fs.existsSync(file)) return false;
    const content = fs.readFileSync(file, "utf-8");
    return content.includes(GITCONFIG_BLOCK_START) && content.includes(GITCONFIG_BLOCK_END);
  }

  isInstalled(targetFile?: string): boolean {
    return this.candidateFiles(targetFile).some((file) => this.hasBlock(file));
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

    // Update the block where it already lives; otherwise follow git's own file precedence.
    const existingTarget = this.candidateFiles(targetFile).find((file) => this.hasBlock(file));
    const gitConfigFile = targetFile || existingTarget || this.store.getPathResolver().getUserGitConfigFile();
    const gitConfigDir = path.dirname(gitConfigFile);
    if (!fs.existsSync(gitConfigDir)) {
      fs.mkdirSync(gitConfigDir, { recursive: true });
    }
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

    if (originalContent.includes(GITCONFIG_BLOCK_START)) {
      const replaced = replaceManagedBlock(originalContent, GITCONFIG_BLOCK_START, GITCONFIG_BLOCK_END, `${blockContent}\n`);
      if (!replaced.ok || replaced.content === undefined) {
        return { success: false, backupPath };
      }
      newContent = replaced.content;
    } else {
      newContent = `${originalContent.trimEnd()}\n\n${blockContent}\n`.trimStart();
    }

    fs.writeFileSync(gitConfigFile, newContent, { encoding: "utf-8", mode: 0o644 });
    return { success: true, backupPath };
  }

  remove(targetFile?: string): boolean {
    let ok = true;
    for (const gitConfigFile of this.candidateFiles(targetFile)) {
      if (!fs.existsSync(gitConfigFile)) continue;

      const originalContent = fs.readFileSync(gitConfigFile, "utf-8");
      if (!originalContent.includes(GITCONFIG_BLOCK_START)) continue;

      const removed = removeManagedBlock(originalContent, GITCONFIG_BLOCK_START, GITCONFIG_BLOCK_END);
      if (!removed.ok || removed.content === undefined) {
        ok = false;
        continue;
      }
      fs.writeFileSync(gitConfigFile, removed.content, { encoding: "utf-8", mode: 0o644 });
    }
    return ok;
  }
}
