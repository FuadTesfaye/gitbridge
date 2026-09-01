import * as vscode from "vscode";
import path from "node:path";

export class GitContextService {
  getActiveWorkspaceFolder(): string | undefined {
    // 1. Check active editor's file folder
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.document.uri.scheme === "file") {
      const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (folder) {
        return folder.uri.fsPath;
      }
      return path.dirname(editor.document.uri.fsPath);
    }

    // 2. Check first workspace folder
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].uri.fsPath;
    }

    return undefined;
  }
}

export const gitContextService = new GitContextService();
