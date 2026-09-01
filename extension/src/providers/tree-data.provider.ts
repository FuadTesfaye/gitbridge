import * as vscode from "vscode";
import path from "node:path";
import { BridgeService, bridgeService } from "../services/bridge.service";
import { GitContextService, gitContextService } from "../services/git-context.service";
import {
  GitBridgeTreeItem,
  ContextPropertyItem,
  IdentityTreeItem,
  AccountTreeItem,
  RuleTreeItem,
} from "./tree-items";

export class ContextTreeDataProvider implements vscode.TreeDataProvider<GitBridgeTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GitBridgeTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private bridge: BridgeService = bridgeService,
    private contextService: GitContextService = gitContextService
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: GitBridgeTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GitBridgeTreeItem): Promise<GitBridgeTreeItem[]> {
    if (element) return [];

    const cwd = this.contextService.getActiveWorkspaceFolder();
    const ctx = await this.bridge.resolveContext(cwd);

    const items: GitBridgeTreeItem[] = [];

    // Repository Name
    if (ctx.isGitRepo && ctx.repoRoot) {
      items.push(new ContextPropertyItem("Repository", path.basename(ctx.repoRoot), "repo", ctx.repoRoot));
    } else {
      items.push(new ContextPropertyItem("Workspace", cwd ? path.basename(cwd) : "None", "folder", cwd));
    }

    // Identity
    if (ctx.identity) {
      items.push(
        new ContextPropertyItem(
          "Identity",
          `${ctx.identity.name} <${ctx.identity.email}>`,
          "person",
          `Source: ${ctx.source}`
        )
      );
    } else {
      items.push(new ContextPropertyItem("Identity", "None configured", "warning", "No identity mapped"));
    }

    // Mismatch Alert
    if (ctx.isMismatched && ctx.localGitEmail) {
      const warnItem = new ContextPropertyItem(
        "Email Mismatch",
        `Local '${ctx.localGitEmail}' ≠ Rule '${ctx.identity?.email}'`,
        "alert",
        "Local git config does not match GitBridge rule"
      );
      items.push(warnItem);
    }

    // Resolution Source
    items.push(new ContextPropertyItem("Source", ctx.source.replace("_", " ").toUpperCase(), "tag"));

    // Connected Account
    if (ctx.account) {
      items.push(
        new ContextPropertyItem(
          "Account",
          `@${ctx.account.username} (${ctx.account.providerId.toUpperCase()})`,
          "organization"
        )
      );
    }

    // Remotes
    if (ctx.remotes.length > 0) {
      for (const r of ctx.remotes) {
        const item = new ContextPropertyItem(`Remote (${r.name})`, r.fetchUrl, "link");
        item.contextValue = "gitbridge-context-remotes";
        items.push(item);
      }
    }

    return items;
  }
}

export class IdentitiesTreeDataProvider implements vscode.TreeDataProvider<GitBridgeTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GitBridgeTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private bridge: BridgeService = bridgeService,
    private contextService: GitContextService = gitContextService
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: GitBridgeTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GitBridgeTreeItem): Promise<GitBridgeTreeItem[]> {
    if (element) return [];

    const identities = this.bridge.loadIdentities();
    const cwd = this.contextService.getActiveWorkspaceFolder();
    const ctx = await this.bridge.resolveContext(cwd);

    if (identities.length === 0) {
      const empty = new GitBridgeTreeItem("No identities configured", vscode.TreeItemCollapsibleState.None);
      empty.description = "Click '+' to add";
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }

    return identities.map((id) => new IdentityTreeItem(id, ctx.identity?.id === id.id));
  }
}

export class AccountsTreeDataProvider implements vscode.TreeDataProvider<GitBridgeTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GitBridgeTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private bridge: BridgeService = bridgeService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: GitBridgeTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GitBridgeTreeItem): Promise<GitBridgeTreeItem[]> {
    if (element) return [];

    const accounts = this.bridge.loadAccounts();
    if (accounts.length === 0) {
      const empty = new GitBridgeTreeItem("No accounts connected", vscode.TreeItemCollapsibleState.None);
      empty.description = "Click '+' to login";
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }

    return accounts.map((acc) => new AccountTreeItem(acc));
  }
}

export class RulesTreeDataProvider implements vscode.TreeDataProvider<GitBridgeTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GitBridgeTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private bridge: BridgeService = bridgeService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: GitBridgeTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GitBridgeTreeItem): Promise<GitBridgeTreeItem[]> {
    if (element) return [];

    const rules = this.bridge.loadRules();
    if (rules.length === 0) {
      const empty = new GitBridgeTreeItem("No directory rules", vscode.TreeItemCollapsibleState.None);
      empty.description = "Click '+' to add";
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }

    return rules.map((r) => new RuleTreeItem(r));
  }
}
