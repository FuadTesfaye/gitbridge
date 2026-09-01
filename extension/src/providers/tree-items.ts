import * as vscode from "vscode";
import type { GitIdentity, ProviderAccount, DirectoryRule } from "../../../src/core/config/schema";
import type { ResolvedContext } from "../../../src/core/identity/identity-resolver";

export class GitBridgeTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);
  }
}

export class ContextPropertyItem extends GitBridgeTreeItem {
  constructor(label: string, value: string, iconName: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.tooltip = description ? `${label}: ${value} (${description})` : `${label}: ${value}`;
    this.iconPath = new vscode.ThemeIcon(iconName);
  }
}

export class IdentityTreeItem extends GitBridgeTreeItem {
  constructor(public readonly identity: GitIdentity, public readonly isCurrent: boolean) {
    super(identity.name, vscode.TreeItemCollapsibleState.None);
    this.description = isCurrent ? `✔ ${identity.email} [Active]` : identity.email;
    this.tooltip = `ID: ${identity.id}\nName: ${identity.name}\nEmail: ${identity.email}\nDefault: ${identity.isDefault ? "Yes" : "No"}`;
    this.iconPath = new vscode.ThemeIcon(isCurrent ? "check" : "person");
    this.contextValue = "gitbridge-identity";
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
    this.tooltip = `Provider: ${account.providerId}\nUsername: ${account.username}\nHost: ${account.host}\nAuth: ${account.authType}`;
    
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
    super(rule.path, vscode.TreeItemCollapsibleState.None);
    this.description = `➔ ${rule.identityId}`;
    this.tooltip = `Path: ${rule.path}\nIdentity: ${rule.identityId}\nAccount: ${rule.defaultAccountId || "any"}`;
    this.iconPath = new vscode.ThemeIcon("folder");
    this.contextValue = "gitbridge-rule";
  }
}
