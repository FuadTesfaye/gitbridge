import * as vscode from "vscode";
import path from "node:path";
import { BridgeService, bridgeService } from "../services/bridge.service";
import { GitContextService, gitContextService } from "../services/git-context.service";
import {
  GitBridgeTreeItem,
  EmptyStateItem,
  ContextPropertyItem,
  IdentityTreeItem,
  AccountTreeItem,
  RuleTreeItem,
} from "./tree-items";
import { COMMANDS, CONTEXT_KEYS } from "../constants";

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

    const isHookInstalled = cwd ? await this.bridge.isSafetyHookInstalled(cwd) : false;
    vscode.commands.executeCommand("setContext", CONTEXT_KEYS.HAS_MISMATCH, !!ctx.isMismatched);
    vscode.commands.executeCommand("setContext", CONTEXT_KEYS.HOOK_INSTALLED, isHookInstalled);

    const items: GitBridgeTreeItem[] = [];

    // Repository Name
    if (ctx.isGitRepo && ctx.repoRoot) {
      items.push(
        new ContextPropertyItem("Repository", path.basename(ctx.repoRoot), "repo", {
          description: ctx.repoRoot,
          tooltip: `Repository Root: ${ctx.repoRoot}`,
        })
      );
    } else {
      items.push(
        new ContextPropertyItem("Workspace", cwd ? path.basename(cwd) : "None", "folder", {
          description: cwd,
          tooltip: `Active Folder: ${cwd || "None"}`,
        })
      );
    }

    // Active Identity
    if (ctx.identity) {
      items.push(
        new ContextPropertyItem(
          "Identity",
          `${ctx.identity.name} <${ctx.identity.email}>`,
          "person",
          {
            description: `Source: ${ctx.source}`,
            tooltip: `Active Identity: ${ctx.identity.name}\nEmail: ${ctx.identity.email}\nSource: ${ctx.source}\nClick to switch identity.`,
            contextValue: "gitbridge-context-identity",
            command: {
              command: COMMANDS.SWITCH_IDENTITY,
              title: "Switch Identity",
            },
          }
        )
      );
    } else {
      items.push(
        new ContextPropertyItem("Identity", "None configured", "warning", {
          description: "No identity mapped",
          tooltip: "Click to add or select a Git identity.",
          command: {
            command: COMMANDS.ADD_IDENTITY,
            title: "Add Identity",
          },
        })
      );
    }

    // Mismatch Alert (High Priority)
    if (ctx.isMismatched && ctx.localGitEmail) {
      const warnItem = new ContextPropertyItem(
        "⚠️ Email Mismatch",
        `Local '${ctx.localGitEmail}' ≠ Expected '${ctx.identity?.email}'`,
        "alert",
        {
          description: "Local config mismatch",
          tooltip: `Local git email: '${ctx.localGitEmail}'\nExpected rule email: '${ctx.identity?.email}'\nClick to fix repository email automatically.`,
          contextValue: "gitbridge-context-mismatch",
          color: new vscode.ThemeColor("problemsWarningIcon.foreground"),
          command: {
            command: COMMANDS.FIX_MISMATCH,
            title: "Fix Mismatch",
          },
        }
      );
      items.push(warnItem);
    }

    // Pre-Commit Safety Guard
    if (ctx.isGitRepo) {
      items.push(
        new ContextPropertyItem(
          "Safety Guard",
          isHookInstalled ? "Protected (Hook Active)" : "Not Installed",
          isHookInstalled ? "shield" : "shield-x",
          {
            description: isHookInstalled ? "Pre-commit active" : "Click to install",
            tooltip: isHookInstalled
              ? "Pre-commit identity verification hook is active.\nClick to toggle or uninstall."
              : "Pre-commit hook not installed.\nClick to protect this repository against wrong email commits.",
            contextValue: "gitbridge-context-safety-hook",
            color: isHookInstalled
              ? new vscode.ThemeColor("terminal.ansiGreen")
              : new vscode.ThemeColor("terminal.ansiYellow"),
            command: {
              command: COMMANDS.TOGGLE_SAFETY_HOOK,
              title: "Toggle Safety Guard",
            },
          }
        )
      );
    }

    // Resolution Source
    items.push(
      new ContextPropertyItem("Routing Source", ctx.source.replace("_", " ").toUpperCase(), "tag", {
        tooltip: `Identity resolved via: ${ctx.source}`,
      })
    );

    // Connected Account
    if (ctx.account) {
      items.push(
        new ContextPropertyItem(
          "Account",
          `@${ctx.account.username} (${ctx.account.providerId.toUpperCase()})`,
          "organization",
          {
            tooltip: `Provider: ${ctx.account.providerId}\nUsername: ${ctx.account.username}\nHost: ${ctx.account.host}`,
          }
        )
      );
    }

    // Remotes
    if (ctx.remotes.length > 0) {
      for (const r of ctx.remotes) {
        const item = new ContextPropertyItem(`Remote (${r.name})`, r.fetchUrl, "link", {
          tooltip: `Remote: ${r.name}\nURL: ${r.fetchUrl}\nClick to push all remotes.`,
          contextValue: "gitbridge-context-remotes",
          command: {
            command: COMMANDS.PUSH_ALL,
            title: "Push to Remotes",
          },
        });
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
      return [new EmptyStateItem("No identities configured", "Add Identity (+)", COMMANDS.ADD_IDENTITY)];
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
      return [new EmptyStateItem("No accounts connected", "Login (+)", COMMANDS.AUTH_LOGIN)];
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
      return [new EmptyStateItem("No directory rules", "Add Rule (+)", COMMANDS.ADD_RULE)];
    }

    return rules.map((r) => new RuleTreeItem(r));
  }
}
