import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { IdeSyncManager } from "@/core/ide/ide-sync-manager";

describe("IdeSyncManager", () => {
  let tempDir: string;
  let store: ConfigStore;
  let manager: IdeSyncManager;
  let mockSettingsFile: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-ide-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const paths = new PathResolver(path.join(tempDir, ".gitbridge"));
    store = new ConfigStore(paths);
    manager = new IdeSyncManager(store);

    mockSettingsFile = path.join(tempDir, "User", "settings.json");
    fs.mkdirSync(path.dirname(mockSettingsFile), { recursive: true });
    fs.writeFileSync(mockSettingsFile, JSON.stringify({
      "editor.fontSize": 14,
      "workbench.colorTheme": "Default Dark+",
    }, null, 2));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("discovers supported IDE targets for the system", () => {
    const targets = manager.getDiscoveredIdeTargets();
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.some((t) => t.type === "vscode")).toBe(true);
    expect(targets.some((t) => t.type === "cursor")).toBe(true);
    expect(targets.some((t) => t.type === "antigravity")).toBe(true);
  });

  it("synchronizes VS Code settings with GitBridge git.path and terminal environment", () => {
    const { success, modified } = manager.syncIdeSettings(mockSettingsFile);
    expect(success).toBe(true);
    expect(modified).toBe(true);

    const updated = JSON.parse(fs.readFileSync(mockSettingsFile, "utf-8"));
    expect(updated["editor.fontSize"]).toBe(14);
    expect(updated["git.path"]).toBe(store.getPathResolver().getGitShimPath());
    expect(updated["gitbridge.managed"]).toBe(true);

    const platform = process.platform;
    const envKey = platform === "darwin"
      ? "terminal.integrated.env.osx"
      : platform === "win32"
      ? "terminal.integrated.env.windows"
      : "terminal.integrated.env.linux";

    expect(updated[envKey]).toBeDefined();
    expect(updated[envKey]["PATH"]).toContain(store.getPathResolver().getShimsDir());
  });

  it("safely unsyncs and removes GitBridge settings without affecting user preferences", () => {
    manager.syncIdeSettings(mockSettingsFile);
    const { success, modified } = manager.unsyncIdeSettings(mockSettingsFile);
    expect(success).toBe(true);
    expect(modified).toBe(true);

    const restored = JSON.parse(fs.readFileSync(mockSettingsFile, "utf-8"));
    expect(restored["editor.fontSize"]).toBe(14);
    expect(restored["workbench.colorTheme"]).toBe("Default Dark+");
    expect(restored["git.path"]).toBeUndefined();
    expect(restored["gitbridge.managed"]).toBeUndefined();
  });

  it("executes syncAll and unsyncAll cleanly without errors", () => {
    const syncRes = manager.syncAll();
    expect(syncRes).toBeDefined();
    expect(Array.isArray(syncRes.synced)).toBe(true);
    expect(Array.isArray(syncRes.targets)).toBe(true);

    const unsyncRes = manager.unsyncAll();
    expect(unsyncRes).toBeDefined();
    expect(Array.isArray(unsyncRes.unsynced)).toBe(true);
    expect(Array.isArray(unsyncRes.targets)).toBe(true);
  });
});
