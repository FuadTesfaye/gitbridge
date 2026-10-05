import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore, defaultConfigStore } from "../config/config-store";
import { parse as parseJsoncText, modify, applyEdits, type ParseError, type FormattingOptions } from "jsonc-parser";

/** New properties are inserted with this formatting; existing text is left exactly as it was. */
const SETTINGS_FORMAT: FormattingOptions = { tabSize: 2, insertSpaces: true, eol: "\n" };

/**
 * Reads editor settings (JSON with comments and trailing commas). Returns null
 * when the file is not valid, so callers never overwrite a file they could not
 * understand.
 */
function readSettings(text: string): Record<string, unknown> | null {
  const errors: ParseError[] = [];
  const parsed: unknown = parseJsoncText(text, errors, { allowTrailingComma: true });
  if (errors.length > 0 || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

/**
 * Sets a value at `segments` (or removes it when `value` is undefined) with a
 * minimal text edit, so the user's comments, key order and indentation are
 * preserved instead of being flattened by JSON.stringify.
 */
function editSetting(text: string, segments: (string | number)[], value: unknown): string {
  return applyEdits(text, modify(text, segments, value, { formattingOptions: SETTINGS_FORMAT }));
}

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
    const paths = this.store.getPathResolver();
    const home = paths.getHomeDir();
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
        const appData = paths.hasExplicitHomeDir()
          ? path.join(home, "AppData", "Roaming")
          : process.env.APPDATA || path.join(home, "AppData", "Roaming");
        settingsPath = path.join(appData, ide.dirName, "User", "settings.json");
      } else {
        // Linux / Debian / Arch / Ubuntu
        settingsPath = path.join(paths.getUserConfigDir(), ide.dirName, "User", "settings.json");
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

    let text = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, "utf-8") : "";
    let settings: Record<string, unknown> = {};
    if (text.trim()) {
      const parsed = readSettings(text);
      if (!parsed) {
        return { success: false, modified: false };
      }
      settings = parsed;
    } else {
      text = "{}\n";
    }

    // 1. Set git.path
    text = editSetting(text, ["git.path"], gitShim);
    text = editSetting(text, ["gitbridge.managed"], true);

    // 2. Set terminal environment to prepend shims
    const platform = process.platform;
    const envKey = platform === "darwin"
      ? "terminal.integrated.env.osx"
      : platform === "win32"
      ? "terminal.integrated.env.windows"
      : "terminal.integrated.env.linux";

    const pathSep = platform === "win32" ? ";" : ":";
    const currentEnv = (settings[envKey] as Record<string, unknown> | undefined) ?? {};
    const existingPath = typeof currentEnv["PATH"] === "string" ? currentEnv["PATH"] : "${env:PATH}";

    if (!existingPath.includes(shimsDir)) {
      text = editSetting(text, [envKey, "PATH"], `${shimsDir}${pathSep}${existingPath}`);
    }

    fs.writeFileSync(settingsFile, text, { encoding: "utf-8" });
    return { success: true, modified: true };
  }

  /**
   * Removes GitBridge configuration from a single settings.json file.
   */
  unsyncIdeSettings(settingsFile: string): { success: boolean; modified: boolean } {
    if (!fs.existsSync(settingsFile)) return { success: true, modified: false };

    let text = fs.readFileSync(settingsFile, "utf-8");
    if (!text.trim()) return { success: true, modified: false };
    const settings = readSettings(text);
    if (!settings) {
      return { success: false, modified: false };
    }

    let modified = false;
    const shimsDir = this.store.getPathResolver().getShimsDir();
    const gitPath = settings["git.path"];

    if (settings["gitbridge.managed"] || (typeof gitPath === "string" && gitPath.includes(".gitbridge"))) {
      text = editSetting(text, ["git.path"], undefined);
      text = editSetting(text, ["gitbridge.managed"], undefined);
      modified = true;
    }

    const envKeys = [
      "terminal.integrated.env.linux",
      "terminal.integrated.env.osx",
      "terminal.integrated.env.windows",
    ];

    for (const envKey of envKeys) {
      const env = settings[envKey];
      if (!env || typeof env !== "object" || Array.isArray(env)) continue;
      const envPath = (env as Record<string, unknown>)["PATH"];
      if (typeof envPath !== "string" || !envPath.includes(shimsDir)) continue;

      const stripped = envPath.replace(`${shimsDir}:`, "").replace(`${shimsDir};`, "").replace(shimsDir, "");
      const otherKeys = Object.keys(env).filter((k) => k !== "PATH");
      if (stripped === "${env:PATH}" || stripped === "") {
        text = otherKeys.length === 0 ? editSetting(text, [envKey], undefined) : editSetting(text, [envKey, "PATH"], undefined);
      } else {
        text = editSetting(text, [envKey, "PATH"], stripped);
      }
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(settingsFile, text, { encoding: "utf-8" });
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
        const raw = readSettings(fs.readFileSync(t.settingsPath, "utf-8"));
        if (raw) {
          gitPath = typeof raw["git.path"] === "string" ? (raw["git.path"] as string) : undefined;
          if (raw["gitbridge.managed"] || (typeof gitPath === "string" && gitPath.includes(".gitbridge"))) {
            synced = true;
          }
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
