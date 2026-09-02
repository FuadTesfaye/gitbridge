import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import {
  GitOverrideManager,
  OVERRIDE_BLOCK_START,
  OVERRIDE_BLOCK_END,
} from "@/core/git/override-manager";

describe("GitOverrideManager", () => {
  let tempDir: string;
  let store: ConfigStore;
  let manager: GitOverrideManager;
  let testHomeDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gitbridge-override-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    testHomeDir = path.join(tempDir, "mock-home");
    fs.mkdirSync(testHomeDir, { recursive: true });

    const paths = new PathResolver(path.join(testHomeDir, ".gitbridge"));
    store = new ConfigStore(paths);
    manager = new GitOverrideManager(store);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("finds the real system git executable", () => {
    const realGit = manager.findRealGitPath();
    expect(realGit).not.toBeNull();
    expect(typeof realGit).toBe("string");
    expect(fs.existsSync(realGit!)).toBe(true);
  });

  it("installs cross-platform shims (Unix, CMD, PowerShell)", () => {
    const { success, shimsDir } = manager.installShims("/usr/bin/git");
    expect(success).toBe(true);
    expect(fs.existsSync(shimsDir)).toBe(true);

    const unixShim = path.join(shimsDir, "git");
    const cmdShim = path.join(shimsDir, "git.cmd");
    const batShim = path.join(shimsDir, "git.bat");
    const psShim = path.join(shimsDir, "git.ps1");

    expect(fs.existsSync(unixShim)).toBe(true);
    expect(fs.existsSync(cmdShim)).toBe(true);
    expect(fs.existsSync(batShim)).toBe(true);
    expect(fs.existsSync(psShim)).toBe(true);

    const unixContent = fs.readFileSync(unixShim, "utf-8");
    expect(unixContent).toContain("#!/usr/bin/env bash");
    expect(unixContent).toContain("GITBRIDGE_OVERRIDE_BYPASS");
    expect(unixContent).toContain("git-proxy");

    const cmdContent = fs.readFileSync(cmdShim, "utf-8");
    expect(cmdContent).toContain("@echo off");
    expect(cmdContent).toContain("git-proxy");

    const psContent = fs.readFileSync(psShim, "utf-8");
    expect(psContent).toContain("GITBRIDGE_OVERRIDE_BYPASS");
    expect(psContent).toContain("git-proxy");
  });

  it("uninstalls shims cleanly", () => {
    manager.installShims("/usr/bin/git");
    const shimsDir = store.getPathResolver().getShimsDir();
    expect(fs.existsSync(path.join(shimsDir, "git"))).toBe(true);

    manager.uninstallShims();
    expect(fs.existsSync(path.join(shimsDir, "git"))).toBe(false);
    expect(fs.existsSync(path.join(shimsDir, "git.cmd"))).toBe(false);
    expect(fs.existsSync(path.join(shimsDir, "git.ps1"))).toBe(false);
  });

  it("injects and removes override block from shell config files non-destructively", () => {
    const mockBashrc = path.join(testHomeDir, ".bashrc");
    const mockZshrc = path.join(testHomeDir, ".zshrc");
    fs.writeFileSync(mockBashrc, "# User alias\nalias ll='ls -la'\n");
    fs.writeFileSync(mockZshrc, "# Zsh config\nexport ZSH_THEME=robbyrussell\n");

    // Override getShellTargets for isolated testing
    manager.getShellTargets = () => [
      { path: mockBashrc, type: "posix" },
      { path: mockZshrc, type: "posix" },
    ];

    expect(manager.isInstalledInFile(mockBashrc)).toBe(false);
    expect(manager.isInstalledInFile(mockZshrc)).toBe(false);

    const { modifiedFiles } = manager.injectShellProfiles();
    expect(modifiedFiles).toContain(mockBashrc);
    expect(modifiedFiles).toContain(mockZshrc);

    expect(manager.isInstalledInFile(mockBashrc)).toBe(true);
    expect(manager.isInstalledInFile(mockZshrc)).toBe(true);

    const bashContent = fs.readFileSync(mockBashrc, "utf-8");
    expect(bashContent).toContain(OVERRIDE_BLOCK_START);
    expect(bashContent).toContain(OVERRIDE_BLOCK_END);
    expect(bashContent).toContain("export PATH=");
    expect(bashContent).toContain("alias ll='ls -la'");

    // Clean removal
    const { modifiedFiles: cleaned } = manager.removeShellProfiles();
    expect(cleaned).toContain(mockBashrc);
    expect(cleaned).toContain(mockZshrc);

    expect(manager.isInstalledInFile(mockBashrc)).toBe(false);
    expect(manager.isInstalledInFile(mockZshrc)).toBe(false);

    const restoredBash = fs.readFileSync(mockBashrc, "utf-8");
    expect(restoredBash).not.toContain(OVERRIDE_BLOCK_START);
    expect(restoredBash).toContain("alias ll='ls -la'");
  });

  it("tracks complete override status accurately", () => {
    const statusBefore = manager.getOverrideStatus();
    expect(statusBefore.enabled).toBe(false);
    expect(statusBefore.shimsInstalled).toBe(false);

    manager.enable();

    const statusAfter = manager.getOverrideStatus();
    expect(statusAfter.enabled).toBe(true);
    expect(statusAfter.shimsInstalled).toBe(true);
    expect(statusAfter.realGitPath).not.toBeNull();

    manager.disable();
    const statusDisabled = manager.getOverrideStatus();
    expect(statusDisabled.enabled).toBe(false);
    expect(statusDisabled.shimsInstalled).toBe(false);
  });
});
