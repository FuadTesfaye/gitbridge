import * as vscode from "vscode";
import type { GitIdentity, ProviderAccount, DirectoryRule } from "../../../src/core/config/schema";

export class GitBridgeTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);
  }
}

export class EmptyStateItem extends GitBridgeTreeItem {
  constructor(message: string, commandTitle?: string, commandId?: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("info");
    this.description = commandTitle;
    if (commandId) {
      this.command = {
        command: commandId,
        title: commandTitle || message,
      };
    }
  }
}

export class ContextPropertyItem extends GitBridgeTreeItem {
  constructor(
    label: string,
    value: string,
    iconName: string,
    options?: {
      description?: string;
      tooltip?: string;
      contextValue?: string;
      command?: vscode.Command;
      color?: vscode.ThemeColor;
    }
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.tooltip = options?.tooltip || (options?.description ? `${label}: ${value} (${options.description})` : `${label}: ${value}`);
    this.iconPath = options?.color ? new vscode.ThemeIcon(iconName, options.color) : new vscode.ThemeIcon(iconName);
    if (options?.contextValue) {
      this.contextValue = options.contextValue;
    }
    if (options?.command) {
      this.command = options.command;
    }
  }
}

export class IdentityTreeItem extends GitBridgeTreeItem {
  constructor(public readonly identity: GitIdentity, public readonly isCurrent: boolean) {
    super(identity.name, vscode.TreeItemCollapsibleState.None);
    
    const tags: string[] = [];
    if (isCurrent) tags.push("Active");
    if (identity.isDefault) tags.push("Default");

    this.description = tags.length > 0 ? `${identity.email} [${tags.join(", ")}]` : identity.email;
    
    let tooltip = `ID: ${identity.id}\nName: ${identity.name}\nEmail: ${identity.email}\nDefault: ${identity.isDefault ? "Yes" : "No"}`;
    if (identity.signingKey) {
      tooltip += `\nSigning Key: ${identity.signingKey}`;
    }
    this.tooltip = tooltip;

    if (isCurrent) {
      this.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("terminal.ansiGreen"));
      this.contextValue = "gitbridge-identity-active";
    } else {
      this.iconPath = new vscode.ThemeIcon("person");
      this.contextValue = "gitbridge-identity";
    }

    this.command = {
      command: "gitbridge.switchIdentity",
      title: "Switch Identity",
      arguments: [identity.id],
    };
  }
}

export class AccountTreeItem extends GitBridgeTreeItem {
  constructor(public readonly account: ProviderAccount) {
    super(`@${account.username}`, vscode.TreeItemCollapsibleState.None);
    this.description = `${account.providerId.toUpperCase()} (${account.host})`;
    
    let tooltip = `Provider: ${account.providerId}\nUsername: ${account.username}\nHost: ${account.host}\nAuth: ${account.authType}`;
    if (account.sshKeyPath) {
      tooltip += `\nSSH Key: ${account.sshKeyPath}`;
      tooltip += `\nSSH Host Alias: ${account.host}-${account.id}`;
    }
    this.tooltip = tooltip;
    
    let icon = "organization";
    if (account.providerId === "github") icon = "github";
    else if (account.providerId === "gitlab") icon = "git-merge";
    else if (account.providerId === "bitbucket") icon = "repo-forked";

    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = "gitbridge-account";
  }
}

export class RuleTreeItem extends GitBridgeTreeItem {
  constructor(public readonly rule: DirectoryRule) {
    const displayPath = rule.path.replace(/^\/home\/[^/]+/, "~");
    super(displayPath, vscode.TreeItemCollapsibleState.None);
    this.description = `➔ ${rule.identityId}`;
    this.tooltip = `Path: ${rule.path}\nIdentity: ${rule.identityId}\nAccount Hint: ${rule.defaultAccountId || "any"}\nClick to open folder in workspace.`;
    this.iconPath = new vscode.ThemeIcon("folder");
    this.contextValue = "gitbridge-rule";
    this.command = {
      command: "gitbridge.openDirectoryRule",
      title: "Open Folder",
      arguments: [rule],
    };
  }
}
