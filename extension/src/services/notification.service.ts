import * as vscode from "vscode";

export class NotificationService {
  async showInfo(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showInformationMessage(`GitBridge: ${message}`, ...items);
  }

  async showWarning(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showWarningMessage(`GitBridge: ${message}`, ...items);
  }

  async showError(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showErrorMessage(`GitBridge: ${message}`, ...items);
  }

  async promptInput(options: {
    prompt: string;
    placeholder?: string;
    value?: string;
    validateInput?: (val: string) => string | undefined;
  }): Promise<string | undefined> {
    return vscode.window.showInputBox({
      title: "GitBridge",
      prompt: options.prompt,
      placeHolder: options.placeholder,
      value: options.value,
      validateInput: options.validateInput,
    });
  }

  async promptQuickPick<T extends vscode.QuickPickItem>(
    items: T[],
    options: { title?: string; placeholder?: string }
  ): Promise<T | undefined> {
    return vscode.window.showQuickPick(items, {
      title: options.title || "GitBridge",
      placeHolder: options.placeholder,
      matchOnDescription: true,
      matchOnDetail: true,
    });
  }
}

export const notificationService = new NotificationService();
