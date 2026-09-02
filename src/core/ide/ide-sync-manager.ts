import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore, defaultConfigStore } from "../config/config-store";
import { getHomeDir } from "@/utils/platform";

export interface IdeTarget {
  name: string;
  type: "vscode" | "vscode-insiders" | "cursor" | "codium" | "antigravity" | "jetbrains";
  settingsPath: string;
}

export interface IdeStatusInfo {
  name: string;
  type: IdeTarget["type"];
  settingsPath: string;
  installed: boolean;
  synced: boolean;
  gitPath?: string;
}

export class IdeSyncManager {
  private store: ConfigStore;

  constructor(store: ConfigStore = defaultConfigStore) {
    this.store = store;
  }

  /**
   * Discovers all supported IDE settings paths on the current platform.
   */
  getDiscoveredIdeTargets(): IdeTarget[] {
    const home = getHomeDir();
    const platform = process.platform;
    const targets: IdeTarget[] = [];

    const ideConfigs: Array<{ name: string; type: IdeTarget["type"]; dirName: string }> = [
      { name: "Visual Studio Code", type: "vscode", dirName: "Code" },
      { name: "VS Code Insiders", type: "vscode-insiders", dirName: "Code - Insiders" },
      { name: "Cursor", type: "cursor", dirName: "Cursor" },
      { name: "VSCodium", type: "codium", dirName: "VSCodium" },
      { name: "Antigravity IDE", type: "antigravity", dirName: "Antigravity" },
    ];

    for (const ide of ideConfigs) {
      let settingsPath: string;

      if (platform === "darwin") {
        settingsPath = path.join(home, "Library", "Application Support", ide.dirName, "User", "settings.json");
      } else if (platform === "win32") {
        const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
        settingsPath = path.join(appData, ide.dirName, "User", "settings.json");
      } else {
        // Linux / Debian / Arch / Ubuntu
        const configBase = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
        settingsPath = path.join(configBase, ide.dirName, "User", "settings.json");
      }

      targets.push({
        name: ide.name,
        type: ide.type,
        settingsPath,
      });
    }

    return targets;
  }

  private createBackup(filePath: string): string | null {
    if (!fs.existsSync(filePath)) return null;
    const backupsDir = this.store.getPathResolver().getBackupsDir();
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `${path.basename(path.dirname(path.dirname(filePath)))}-${path.basename(filePath)}`;
    const backupFile = path.join(backupsDir, `${baseName}.${timestamp}.bak`);
    fs.copyFileSync(filePath, backupFile);
    return backupFile;
  }

  /**
   * Synchronizes a single VS Code-compatible settings.json file with GitBridge.
   */
  syncIdeSettings(settingsFile: string): { success: boolean; modified: boolean } {
    const shimsDir = this.store.getPathResolver().getShimsDir();
    const gitShim = this.store.getPathResolver().getGitShimPath();
    const dir = path.dirname(settingsFile);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.createBackup(settingsFile);

    let settings: Record<string, any> = {};
    if (fs.existsSync(settingsFile)) {
      try {
        const content = fs.readFileSync(settingsFile, "utf-8").trim();
        if (content) {
          settings = JSON.parse(content);
        }
      } catch {
        // If JSON has comments or trailing commas, handle safely
        settings = {};
      }
    }

    // 1. Set git.path
    settings["git.path"] = gitShim;
    settings["gitbridge.managed"] = true;

    // 2. Set terminal environment to prepend shims
    const platform = process.platform;
    const envKey = platform === "darwin"
      ? "terminal.integrated.env.osx"
      : platform === "win32"
      ? "terminal.integrated.env.windows"
      : "terminal.integrated.env.linux";

    const pathSep = platform === "win32" ? ";" : ":";
    const currentEnv = settings[envKey] || {};
    const existingPath = currentEnv["PATH"] || "${env:PATH}";

    if (!existingPath.includes(shimsDir)) {
      currentEnv["PATH"] = `${shimsDir}${pathSep}${existingPath}`;
      settings[envKey] = currentEnv;
    }

    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), { encoding: "utf-8" });
    return { success: true, modified: true };
  }

  /**
   * Removes GitBridge configuration from a single settings.json file.
   */
  unsyncIdeSettings(settingsFile: string): { success: boolean; modified: boolean } {
    if (!fs.existsSync(settingsFile)) return { success: true, modified: false };

    let settings: Record<string, any> = {};
    try {
      const content = fs.readFileSync(settingsFile, "utf-8").trim();
      if (!content) return { success: true, modified: false };
      settings = JSON.parse(content);
    } catch {
      return { success: false, modified: false };
    }

    let modified = false;
    const shimsDir = this.store.getPathResolver().getShimsDir();

    if (settings["gitbridge.managed"] || (typeof settings["git.path"] === "string" && settings["git.path"].includes(".gitbridge"))) {
      delete settings["git.path"];
      delete settings["gitbridge.managed"];
      modified = true;
    }

    const envKeys = [
      "terminal.integrated.env.linux",
      "terminal.integrated.env.osx",
      "terminal.integrated.env.windows",
    ];

    for (const envKey of envKeys) {
      if (settings[envKey] && typeof settings[envKey]["PATH"] === "string") {
        let p = settings[envKey]["PATH"];
        if (p.includes(shimsDir)) {
          p = p.replace(`${shimsDir}:`, "").replace(`${shimsDir};`, "").replace(shimsDir, "");
          if (p === "${env:PATH}" || p === "") {
            delete settings[envKey]["PATH"];
          } else {
            settings[envKey]["PATH"] = p;
          }
          if (Object.keys(settings[envKey]).length === 0) {
            delete settings[envKey];
          }
          modified = true;
        }
      }
    }

    if (modified) {
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), { encoding: "utf-8" });
    }

    return { success: true, modified };
  }

  /**
   * Synchronizes all installed and discovered IDEs on the system.
   */
  syncAll(): { synced: string[]; targets: IdeStatusInfo[] } {
    const targets = this.getIdeStatus();
    const synced: string[] = [];

    for (const target of targets) {
      // Sync if installed or if parent config folder exists
      if (target.installed || fs.existsSync(path.dirname(path.dirname(target.settingsPath)))) {
        this.syncIdeSettings(target.settingsPath);
        synced.push(target.name);
      }
    }

    return {
      synced,
      targets: this.getIdeStatus(),
    };
  }

  /**
   * Unsyncs all discovered IDEs on the system.
   */
  unsyncAll(): { unsynced: string[]; targets: IdeStatusInfo[] } {
    const targets = this.getIdeStatus();
    const unsynced: string[] = [];

    for (const target of targets) {
      if (target.synced) {
        this.unsyncIdeSettings(target.settingsPath);
        unsynced.push(target.name);
      }
    }

    return {
      unsynced,
      targets: this.getIdeStatus(),
    };
  }

  /**
   * Returns current status of all supported IDEs.
   */
  getIdeStatus(): IdeStatusInfo[] {
    const targets = this.getDiscoveredIdeTargets();
    const shimsDir = this.store.getPathResolver().getShimsDir();

    return targets.map((t) => {
      const installed = fs.existsSync(t.settingsPath) || fs.existsSync(path.dirname(path.dirname(t.settingsPath)));
      let synced = false;
      let gitPath: string | undefined;

      if (fs.existsSync(t.settingsPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(t.settingsPath, "utf-8"));
          gitPath = raw["git.path"];
          if (raw["gitbridge.managed"] || (typeof gitPath === "string" && gitPath.includes(".gitbridge"))) {
            synced = true;
          }
        } catch {
          // parse error
        }
      }

      return {
        name: t.name,
        type: t.type,
        settingsPath: t.settingsPath,
        installed,
        synced,
        gitPath,
      };
    });
  }
}
