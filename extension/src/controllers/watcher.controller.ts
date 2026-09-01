import * as vscode from "vscode";
import { BridgeService, bridgeService } from "../services/bridge.service";

export class WatcherController implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private onStateChangeCallbacks: Array<() => void> = [];

  constructor(private bridge: BridgeService = bridgeService) {
    // 1. Listen for active editor change
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.notifyChange();
      })
    );

    // 2. Listen for workspace folders change
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.notifyChange();
      })
    );

    // 3. Watch workspace .git config and HEAD
    const gitWatcher = vscode.workspace.createFileSystemWatcher("**/.git/{config,HEAD}");
    gitWatcher.onDidChange(() => this.notifyChange());
    gitWatcher.onDidCreate(() => this.notifyChange());
    gitWatcher.onDidDelete(() => this.notifyChange());
    this.disposables.push(gitWatcher);

    // 4. Watch global ~/.gitbridge files
    try {
      const baseDir = this.bridge.getStore().getPathResolver().getBaseDir();
      const globalPattern = new vscode.RelativePattern(baseDir, "**/*.json");
      const globalWatcher = vscode.workspace.createFileSystemWatcher(globalPattern);
      globalWatcher.onDidChange(() => this.notifyChange());
      globalWatcher.onDidCreate(() => this.notifyChange());
      globalWatcher.onDidDelete(() => this.notifyChange());
      this.disposables.push(globalWatcher);
    } catch {
      // ignore
    }
  }

  onDidChange(callback: () => void): vscode.Disposable {
    this.onStateChangeCallbacks.push(callback);
    return {
      dispose: () => {
        this.onStateChangeCallbacks = this.onStateChangeCallbacks.filter((c) => c !== callback);
      },
    };
  }

  private notifyChange(): void {
    for (const callback of this.onStateChangeCallbacks) {
      try {
        callback();
      } catch {
        // ignore
      }
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
