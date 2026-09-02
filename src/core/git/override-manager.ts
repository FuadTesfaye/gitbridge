import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore, defaultConfigStore } from "../config/config-store";
import { getHomeDir, collapseTilde, expandTilde } from "@/utils/platform";

export const OVERRIDE_BLOCK_START = "# --- BEGIN GITBRIDGE OVERRIDE ---";
export const OVERRIDE_BLOCK_END = "# --- END GITBRIDGE OVERRIDE ---";

export interface ShellTarget {
  path: string;
  type: "posix" | "fish" | "powershell";
}

export interface OverrideStatus {
  enabled: boolean;
  shimsInstalled: boolean;
  shimsDir: string;
  realGitPath: string | null;
  modifiedShellFiles: string[];
  isInCurrentPath: boolean;
}

export class GitOverrideManager {
  private store: ConfigStore;

  constructor(store: ConfigStore = defaultConfigStore) {
    this.store = store;
  }

  /**
   * Discovers the real underlying `git` executable on the system,
   * skipping any GitBridge shims to avoid recursion.
   */
  findRealGitPath(): string | null {
    const cached = this.store.getRealGitPath();
    if (cached && fs.existsSync(cached)) {
      try {
        fs.accessSync(cached, fs.constants.X_OK);
        return cached;
      } catch {
        // Fall through to search if not executable
      }
    }

    const isWindows = process.platform === "win32";
    const binaryName = isWindows ? "git.exe" : "git";
    const shimsDir = path.resolve(this.store.getPathResolver().getShimsDir());

    // 1. Search in process.env.PATH
    const pathEnv = process.env.PATH || "";
    const pathDirs = pathEnv.split(path.delimiter);

    for (const rawDir of pathDirs) {
      if (!rawDir) continue;
      const normalizedDir = path.resolve(rawDir);
      // Skip gitbridge shims
      if (normalizedDir === shimsDir || normalizedDir.includes(path.join(".gitbridge", "shims"))) {
        continue;
      }

      const candidate = path.join(normalizedDir, binaryName);
      if (fs.existsSync(candidate)) {
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          this.store.setRealGitPath(candidate);
          return candidate;
        } catch {
          // not executable
        }
      }
    }

    // 2. Search common fallback paths
    const fallbacks: string[] = isWindows
      ? [
          "C:\\Program Files\\Git\\cmd\\git.exe",
          "C:\\Program Files\\Git\\bin\\git.exe",
          "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
          path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "cmd", "git.exe"),
          path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "cmd", "git.exe"),
        ]
      : [
          "/usr/bin/git",
          "/usr/local/bin/git",
          "/opt/homebrew/bin/git",
          "/bin/git",
          "/opt/local/bin/git",
        ];

    for (const candidate of fallbacks) {
      if (candidate && fs.existsSync(candidate)) {
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          this.store.setRealGitPath(candidate);
          return candidate;
        } catch {
          // not executable
        }
      }
    }

    return null;
  }

  /**
   * Generates cross-platform shims for Unix (bash/sh), Windows CMD, and Windows PowerShell.
   */
  installShims(customRealGit?: string): { success: boolean; shimsDir: string } {
    this.store.ensureDirectories();
    const shimsDir = this.store.getPathResolver().getShimsDir();
    const realGit = customRealGit || this.findRealGitPath() || (process.platform === "win32" ? "git.exe" : "/usr/bin/git");

    if (!fs.existsSync(shimsDir)) {
      fs.mkdirSync(shimsDir, { recursive: true, mode: 0o755 });
    }

    // 1. Unix Shim (Linux / macOS: Debian, Arch, Ubuntu, macOS)
    const unixShimPath = path.join(shimsDir, "git");
    const unixShimContent = `#!/usr/bin/env bash
# GitBridge Git Override Shim
# Routes \`git\` commands through GitBridge while preserving 100% native git compatibility.

if [ "$GITBRIDGE_OVERRIDE_BYPASS" = "1" ]; then
    REAL_GIT="\${GITBRIDGE_REAL_GIT:-${realGit}}"
    exec "$REAL_GIT" "$@"
fi

if command -v gitbridge >/dev/null 2>&1; then
    exec gitbridge git-proxy "$@"
elif command -v gb >/dev/null 2>&1; then
    exec gb git-proxy "$@"
else
    REAL_GIT="\${GITBRIDGE_REAL_GIT:-${realGit}}"
    exec "$REAL_GIT" "$@"
fi
`;
    fs.writeFileSync(unixShimPath, unixShimContent, { encoding: "utf-8", mode: 0o755 });

    // 2. Windows CMD & BAT Shim
    const cmdShimPath = path.join(shimsDir, "git.cmd");
    const batShimPath = path.join(shimsDir, "git.bat");
    const cmdShimContent = `@echo off
rem GitBridge Git Override Shim for Windows CMD
if "%GITBRIDGE_OVERRIDE_BYPASS%"=="1" goto bypass

where gitbridge >nul 2>&1
if %ERRORLEVEL% equ 0 (
    gitbridge git-proxy %*
    exit /b %ERRORLEVEL%
)

where gb >nul 2>&1
if %ERRORLEVEL% equ 0 (
    gb git-proxy %*
    exit /b %ERRORLEVEL%
)

:bypass
if defined GITBRIDGE_REAL_GIT (
    "%GITBRIDGE_REAL_GIT%" %*
    exit /b %ERRORLEVEL%
)

if exist "${realGit}" (
    "${realGit}" %*
    exit /b %ERRORLEVEL%
)

git.exe %*
`;
    fs.writeFileSync(cmdShimPath, cmdShimContent, { encoding: "utf-8", mode: 0o755 });
    fs.writeFileSync(batShimPath, cmdShimContent, { encoding: "utf-8", mode: 0o755 });

    // 3. PowerShell Shim
    const psShimPath = path.join(shimsDir, "git.ps1");
    const psShimContent = `# GitBridge Git Override Shim for PowerShell
param([Parameter(ValueFromRemainingArguments = $true)]$args)

if ($env:GITBRIDGE_OVERRIDE_BYPASS -eq "1") {
    $realGit = if ($env:GITBRIDGE_REAL_GIT) { $env:GITBRIDGE_REAL_GIT } else { "${realGit}" }
    & $realGit @args
    exit $LASTEXITCODE
}

if (Get-Command gitbridge -ErrorAction SilentlyContinue) {
    & gitbridge git-proxy @args
    exit $LASTEXITCODE
} elseif (Get-Command gb -ErrorAction SilentlyContinue) {
    & gb git-proxy @args
    exit $LASTEXITCODE
} else {
    $realGit = if ($env:GITBRIDGE_REAL_GIT) { $env:GITBRIDGE_REAL_GIT } else { "${realGit}" }
    & $realGit @args
    exit $LASTEXITCODE
}
`;
    fs.writeFileSync(psShimPath, psShimContent, { encoding: "utf-8", mode: 0o755 });

    return { success: true, shimsDir };
  }

  /**
   * Safely deletes generated shims.
   */
  uninstallShims(): boolean {
    const shimsDir = this.store.getPathResolver().getShimsDir();
    if (!fs.existsSync(shimsDir)) return true;

    const shimFiles = ["git", "git.cmd", "git.bat", "git.ps1"];
    for (const file of shimFiles) {
      const fullPath = path.join(shimsDir, file);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore error
        }
      }
    }
    return true;
  }

  /**
   * Returns list of shell configuration files to check / inject based on platform and environment.
   */
  getShellTargets(): ShellTarget[] {
    const home = getHomeDir();
    const targets: ShellTarget[] = [];

    // Bash & POSIX profiles
    const bashRc = path.join(home, ".bashrc");
    const bashProfile = path.join(home, ".bash_profile");
    const profile = path.join(home, ".profile");
    const zshRc = path.join(home, ".zshrc");

    // Always include .bashrc on Linux/Debian/Arch/macOS
    if (fs.existsSync(bashRc) || process.platform === "linux") {
      targets.push({ path: bashRc, type: "posix" });
    }
    if (fs.existsSync(bashProfile)) {
      targets.push({ path: bashProfile, type: "posix" });
    }
    if (fs.existsSync(profile)) {
      targets.push({ path: profile, type: "posix" });
    }
    // Include .zshrc if exists or on macOS
    if (fs.existsSync(zshRc) || process.platform === "darwin") {
      targets.push({ path: zshRc, type: "posix" });
    }

    // Fish shell
    const fishConfig = path.join(home, ".config", "fish", "config.fish");
    if (fs.existsSync(fishConfig) || fs.existsSync(path.join(home, ".config", "fish"))) {
      targets.push({ path: fishConfig, type: "fish" });
    }

    // PowerShell
    const psProfiles: string[] = [];
    if (process.platform === "win32") {
      const docs = path.join(home, "Documents");
      psProfiles.push(path.join(docs, "PowerShell", "Microsoft.PowerShell_profile.ps1"));
      psProfiles.push(path.join(docs, "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"));
    }
    psProfiles.push(path.join(home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1"));

    for (const psPath of psProfiles) {
      if (fs.existsSync(psPath) || fs.existsSync(path.dirname(psPath))) {
        targets.push({ path: psPath, type: "powershell" });
      }
    }

    return targets;
  }

  private createShellBackup(targetFile: string): string | null {
    if (!fs.existsSync(targetFile)) return null;
    const backupsDir = this.store.getPathResolver().getBackupsDir();
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = path.basename(targetFile);
    const backupFile = path.join(backupsDir, `${baseName}.${timestamp}.bak`);
    fs.copyFileSync(targetFile, backupFile);
    return backupFile;
  }

  /**
   * Injects PATH precedence into all detected shell config files.
   */
  injectShellProfiles(): { modifiedFiles: string[] } {
    const shimsDir = this.store.getPathResolver().getShimsDir();
    const posixShimsDir = collapseTilde(shimsDir);
    const targets = this.getShellTargets();
    const modifiedFiles: string[] = [];

    for (const target of targets) {
      try {
        const targetDir = path.dirname(target.path);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        this.createShellBackup(target.path);

        let originalContent = "";
        if (fs.existsSync(target.path)) {
          originalContent = fs.readFileSync(target.path, "utf-8");
        }

        let blockContent = "";
        if (target.type === "posix") {
          blockContent = [
            OVERRIDE_BLOCK_START,
            `# Do not edit this block directly. Manage via: gitbridge / gb`,
            `export PATH="${posixShimsDir.replace(/^~/, "$HOME")}:$PATH"`,
            OVERRIDE_BLOCK_END,
          ].join("\n");
        } else if (target.type === "fish") {
          blockContent = [
            OVERRIDE_BLOCK_START,
            `# Do not edit this block directly. Manage via: gitbridge / gb`,
            `set -gx PATH "${posixShimsDir.replace(/^~/, "$HOME")}" $PATH`,
            OVERRIDE_BLOCK_END,
          ].join("\n");
        } else if (target.type === "powershell") {
          blockContent = [
            OVERRIDE_BLOCK_START,
            `# Do not edit this block directly. Manage via: gitbridge / gb`,
            `$env:PATH = "${shimsDir};" + $env:PATH`,
            OVERRIDE_BLOCK_END,
          ].join("\n");
        }

        let newContent: string;
        if (originalContent.includes(OVERRIDE_BLOCK_START) && originalContent.includes(OVERRIDE_BLOCK_END)) {
          const before = originalContent.substring(0, originalContent.indexOf(OVERRIDE_BLOCK_START));
          const after = originalContent.substring(originalContent.indexOf(OVERRIDE_BLOCK_END) + OVERRIDE_BLOCK_END.length);
          newContent = `${blockContent}\n\n${before.trim()}\n${after.trim()}`.trim() + "\n";
        } else {
          // Prepend block to the top so PATH takes precedence
          newContent = `${blockContent}\n\n${originalContent.trim()}`.trim() + "\n";
        }

        fs.writeFileSync(target.path, newContent, { encoding: "utf-8" });
        modifiedFiles.push(target.path);
      } catch (err) {
        // Continue with other shell profiles
      }
    }

    return { modifiedFiles };
  }

  /**
   * Removes GitBridge override block from all shell config files.
   */
  removeShellProfiles(): { modifiedFiles: string[] } {
    const targets = this.getShellTargets();
    const modifiedFiles: string[] = [];

    for (const target of targets) {
      if (!fs.existsSync(target.path)) continue;

      try {
        const originalContent = fs.readFileSync(target.path, "utf-8");
        if (!originalContent.includes(OVERRIDE_BLOCK_START)) continue;

        const before = originalContent.substring(0, originalContent.indexOf(OVERRIDE_BLOCK_START));
        const after = originalContent.substring(originalContent.indexOf(OVERRIDE_BLOCK_END) + OVERRIDE_BLOCK_END.length);
        const cleaned = `${before.trim()}\n${after.trim()}`.trim();

        if (cleaned.length === 0) {
          fs.writeFileSync(target.path, "", { encoding: "utf-8" });
        } else {
          fs.writeFileSync(target.path, `${cleaned}\n`, { encoding: "utf-8" });
        }

        modifiedFiles.push(target.path);
      } catch {
        // Continue with other shell profiles
      }
    }

    return { modifiedFiles };
  }

  /**
   * Checks whether the given shell file has the GitBridge override block installed.
   */
  isInstalledInFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, "utf-8");
    return content.includes(OVERRIDE_BLOCK_START) && content.includes(OVERRIDE_BLOCK_END);
  }

  /**
   * Returns comprehensive status of the Git override installation.
   */
  getOverrideStatus(): OverrideStatus {
    const shimsDir = this.store.getPathResolver().getShimsDir();
    const unixShim = path.join(shimsDir, "git");
    const cmdShim = path.join(shimsDir, "git.cmd");
    const psShim = path.join(shimsDir, "git.ps1");

    const shimsInstalled = fs.existsSync(unixShim) || fs.existsSync(cmdShim) || fs.existsSync(psShim);
    const enabled = this.store.isOverrideEnabled();
    const realGitPath = this.store.getRealGitPath() || this.findRealGitPath();

    const modifiedShellFiles = this.getShellTargets()
      .map((t) => t.path)
      .filter((p) => this.isInstalledInFile(p));

    const pathEnv = process.env.PATH || "";
    const isInCurrentPath = pathEnv.split(path.delimiter).some((dir) => {
      const normalized = path.resolve(dir);
      return normalized === path.resolve(shimsDir);
    });

    return {
      enabled,
      shimsInstalled,
      shimsDir,
      realGitPath,
      modifiedShellFiles,
      isInCurrentPath,
    };
  }

  /**
   * Enables the Git override completely.
   */
  enable(): { success: boolean; shimsDir: string; realGitPath: string | null; modifiedFiles: string[] } {
    const realGitPath = this.findRealGitPath();
    this.store.setOverrideEnabled(true);
    const { shimsDir } = this.installShims(realGitPath || undefined);
    const { modifiedFiles } = this.injectShellProfiles();

    return {
      success: true,
      shimsDir,
      realGitPath,
      modifiedFiles,
    };
  }

  /**
   * Disables the Git override completely and cleans up.
   */
  disable(): { success: boolean; modifiedFiles: string[] } {
    this.store.setOverrideEnabled(false);
    this.uninstallShims();
    const { modifiedFiles } = this.removeShellProfiles();

    return {
      success: true,
      modifiedFiles,
    };
  }
}
