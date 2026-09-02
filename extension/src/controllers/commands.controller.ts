import * as vscode from "vscode";
import { BridgeService, bridgeService } from "../services/bridge.service";
import { GitContextService, gitContextService } from "../services/git-context.service";
import { NotificationService, notificationService } from "../services/notification.service";
import { COMMANDS } from "../constants";
import type { DirectoryRule } from "../../../src/core/config/schema";

export class CommandsController implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;

  constructor(
    private bridge: BridgeService = bridgeService,
    private contextService: GitContextService = gitContextService,
    private notifications: NotificationService = notificationService,
    private onRefreshNeeded?: () => void
  ) {
    this.outputChannel = vscode.window.createOutputChannel("GitBridge");
    this.registerCommands();
  }

  private registerCommands(): void {
    // 1. Show Status Bar Menu
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.SHOW_STATUS_BAR_MENU, async () => {
        await this.handleShowStatusBarMenu();
      })
    );

    // 2. Switch Identity
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.SWITCH_IDENTITY, async (targetId?: string) => {
        await this.handleSwitchIdentity(targetId);
      })
    );

    // 3. Set Default Identity
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.SET_DEFAULT_IDENTITY, async (targetId?: string) => {
        await this.handleSetDefaultIdentity(targetId);
      })
    );

    // 4. Remove Identity
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.REMOVE_IDENTITY, async (targetId?: string) => {
        await this.handleRemoveIdentity(targetId);
      })
    );

    // 5. Add Identity
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.ADD_IDENTITY, async () => {
        await this.handleAddIdentity();
      })
    );

    // 6. Add Rule
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.ADD_RULE, async () => {
        await this.handleAddRule();
      })
    );

    // 7. Remove Rule
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.REMOVE_RULE, async (rule?: DirectoryRule | string) => {
        await this.handleRemoveRule(rule);
      })
    );

    // 8. Open Directory Rule
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.OPEN_DIRECTORY_RULE, async (rule?: DirectoryRule) => {
        await this.handleOpenDirectoryRule(rule);
      })
    );

    // 9. Fix Email Mismatch
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.FIX_MISMATCH, async () => {
        await this.handleFixMismatch();
      })
    );

    // 10. Toggle Pre-Commit Safety Hook
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.TOGGLE_SAFETY_HOOK, async () => {
        await this.handleToggleSafetyHook();
      })
    );

    // 11. Init Repo
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.INIT_REPO, async () => {
        await this.handleInitRepo();
      })
    );

    // 12. Auth Login
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.AUTH_LOGIN, async () => {
        await this.handleAuthLogin();
      })
    );

    // 13. Auth Logout
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.AUTH_LOGOUT, async () => {
        await this.handleAuthLogout();
      })
    );

    // 14. Push All Remotes
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.PUSH_ALL, async () => {
        await this.handlePushAll();
      })
    );

    // 15. Doctor Diagnostics
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.DOCTOR, async () => {
        await this.handleDoctor();
      })
    );

    // 16. Enable / Disable Integration
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.ENABLE, async () => {
        await this.handleEnable();
      }),
      vscode.commands.registerCommand(COMMANDS.DISABLE, async () => {
        await this.handleDisable();
      }),
      vscode.commands.registerCommand(COMMANDS.ENABLE_OVERRIDE, async () => {
        await this.handleEnableOverride();
      }),
      vscode.commands.registerCommand(COMMANDS.DISABLE_OVERRIDE, async () => {
        await this.handleDisableOverride();
      }),
      vscode.commands.registerCommand(COMMANDS.TOGGLE_OVERRIDE, async () => {
        await this.handleToggleOverride();
      }),
      vscode.commands.registerCommand(COMMANDS.SYNC_IDE, async () => {
        await this.handleSyncIde();
      }),
      vscode.commands.registerCommand(COMMANDS.UNSYNC_IDE, async () => {
        await this.handleUnsyncIde();
      })
    );

    // 17. Refresh
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.REFRESH, () => {
        this.triggerRefresh();
      })
    );
  }

  private triggerRefresh(): void {
    if (this.onRefreshNeeded) {
      this.onRefreshNeeded();
    }
  }

  private async handleEnable(): Promise<void> {
    this.bridge.enableGitBridge();
    const config = vscode.workspace.getConfiguration("gitbridge");
    if (config.get<boolean>("ide.autoSyncGitPath", true)) {
      this.bridge.syncIde();
    }
    this.notifications.showInfo("GitBridge enabled in ~/.gitconfig and ~/.ssh/config.");
    this.triggerRefresh();
  }

  private async handleDisable(): Promise<void> {
    this.bridge.disableGitBridge();
    this.notifications.showWarning("GitBridge integration disabled. Restored original Git config.");
    this.triggerRefresh();
  }

  private async handleEnableOverride(): Promise<void> {
    this.bridge.enableOverride();
    const config = vscode.workspace.getConfiguration("gitbridge");
    if (config.get<boolean>("ide.autoSyncGitPath", true)) {
      this.bridge.syncIde();
    }
    this.notifications.showInfo("Native Git Override activated! VS Code SCM and terminal now use GitBridge.");
    this.triggerRefresh();
  }

  private async handleDisableOverride(): Promise<void> {
    this.bridge.disableOverride();
    this.notifications.showWarning("Native Git Override deactivated.");
    this.triggerRefresh();
  }

  private async handleToggleOverride(): Promise<void> {
    const status = this.bridge.getOverrideStatus();
    if (status.enabled && status.shimsInstalled) {
      await this.handleDisableOverride();
    } else {
      await this.handleEnableOverride();
    }
  }

  private async handleSyncIde(): Promise<void> {
    const result = this.bridge.syncIde();
    if (result.synced.length > 0) {
      this.notifications.showInfo(`Synchronized GitBridge with: ${result.synced.join(", ")}`);
    } else {
      this.notifications.showInfo("IDE settings configured to use GitBridge shims.");
    }
    this.triggerRefresh();
  }

  private async handleUnsyncIde(): Promise<void> {
    this.bridge.unsyncIde();
    this.notifications.showWarning("Restored default IDE Git configurations.");
    this.triggerRefresh();
  }

  private async handleShowStatusBarMenu(): Promise<void> {
    const cwd = this.contextService.getActiveWorkspaceFolder();
    const ctx = await this.bridge.resolveContext(cwd);
    const identities = this.bridge.loadIdentities();
    const isHookActive = cwd ? await this.bridge.isSafetyHookInstalled(cwd) : false;
    const overrideStatus = this.bridge.getOverrideStatus();
    const ideTargets = this.bridge.getIdeStatus();
    const isIdeSynced = ideTargets.some((t) => t.synced);

    type MenuItem = vscode.QuickPickItem & { action: () => Promise<void> };
    const items: MenuItem[] = [];

    // 1. Mismatch Fix (Top priority if alert is active)
    if (ctx.isMismatched && ctx.identity) {
      items.push({
        label: `$(tools) Fix Email Mismatch`,
        description: `Set local repo to ${ctx.identity.email}`,
        detail: `Current local email '${ctx.localGitEmail}' does not match rule '${ctx.identity.email}'`,
        action: async () => this.handleFixMismatch(),
      });
    }

    // 2. Identities Switcher Section
    for (const id of identities) {
      const isActive = ctx.identity?.id === id.id;
      items.push({
        label: `${isActive ? "$(check)" : "$(person)"} Switch to ${id.name}`,
        description: id.email,
        detail: isActive ? "Active Identity in Current Repository" : id.isDefault ? "Global Default Identity" : undefined,
        action: async () => {
          await this.bridge.setIdentity(id.id, cwd, false);
          this.notifications.showInfo(`Switched repository identity to '${id.name}' (${id.email}).`);
          this.triggerRefresh();
        },
      });
    }

    // 3. Quick Action Items
    items.push({
      label: "$(add) Add New Git Identity...",
      description: "Create a new name/email identity",
      action: async () => this.handleAddIdentity(),
    });

    items.push({
      label: "$(folder-active) Map Current Folder (Add Rule)...",
      description: cwd ? `Create directory rule for ${cwd}` : "Map a workspace folder",
      action: async () => this.handleAddRule(),
    });

    // 4. Override and IDE Controls
    items.push({
      label: overrideStatus.enabled && overrideStatus.shimsInstalled
        ? "$(zap) Disable Native Git Override"
        : "$(zap) Enable Native Git Override",
      description: overrideStatus.enabled ? "Currently proxying all 'git' commands" : "Route standard 'git' through GitBridge",
      action: async () => this.handleToggleOverride(),
    });

    items.push({
      label: isIdeSynced ? "$(sync) Resync IDE Settings" : "$(sync) Sync IDE Settings with GitBridge",
      description: isIdeSynced ? "VS Code git.path is linked" : "Connect VS Code Source Control & Terminal",
      action: async () => this.handleSyncIde(),
    });

    if (ctx.isGitRepo) {
      items.push({
        label: `${isHookActive ? "$(shield)" : "$(shield-x)"} ${isHookActive ? "Uninstall" : "Install"} Pre-Commit Safety Guard`,
        description: isHookActive ? "Currently protecting commits" : "Protect repository against email mismatches",
        action: async () => this.handleToggleSafetyHook(),
      });
    }

    items.push({
      label: "$(pulse) Run Diagnostics (Doctor)",
      description: "Inspect Git, Keyring, SSH Keys & Provider health",
      action: async () => this.handleDoctor(),
    });

    items.push({
      label: "$(refresh) Refresh GitBridge Context",
      description: "Reload all identity and git state",
      action: async () => this.triggerRefresh(),
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: ctx.identity ? `Active: ${ctx.identity.name} <${ctx.identity.email}>` : "Select a GitBridge action",
      title: "GitBridge: Identity & Context Quick Menu",
    });

    if (picked) {
      await picked.action();
    }
  }

  private async handleSwitchIdentity(targetId?: string): Promise<void> {
    const identities = this.bridge.loadIdentities();
    if (identities.length === 0) {
      const choice = await this.notifications.showInfo("No identities configured.", "Add Identity");
      if (choice === "Add Identity") {
        await this.handleAddIdentity();
      }
      return;
    }

    let selectedId = targetId;
    if (!selectedId) {
      const cwd = this.contextService.getActiveWorkspaceFolder();
      const ctx = await this.bridge.resolveContext(cwd);

      const items = identities.map((id) => ({
        label: `$(person) ${id.name}`,
        description: id.email,
        detail: id.id === ctx.identity?.id ? "✔ Current Active Identity" : id.isDefault ? "Global Default" : undefined,
        identityId: id.id,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select Git identity to switch to",
        title: "GitBridge: Switch Identity",
      });

      if (!picked) return;
      selectedId = picked.identityId;
    }

    const scopeChoice = await vscode.window.showQuickPick(
      [
        { label: "$(folder) Current Repository / Workspace", value: "local" },
        { label: "$(globe) Global Default Identity", value: "global" },
      ],
      { placeHolder: "Apply identity to:", title: "GitBridge: Scope" }
    );

    if (!scopeChoice) return;

    const cwd = this.contextService.getActiveWorkspaceFolder();
    await this.bridge.setIdentity(selectedId, cwd, scopeChoice.value === "global");
    this.notifications.showInfo(`Switched identity to '${selectedId}' (${scopeChoice.value}).`);
    this.triggerRefresh();
  }

  private async handleSetDefaultIdentity(targetId?: string): Promise<void> {
    const identities = this.bridge.loadIdentities();
    if (identities.length === 0) {
      this.notifications.showWarning("No identities configured.");
      return;
    }

    let selectedId = targetId;
    if (!selectedId) {
      const picked = await vscode.window.showQuickPick(
        identities.map((id) => ({
          label: id.name,
          description: id.email,
          identityId: id.id,
        })),
        { placeHolder: "Select identity to set as global default", title: "GitBridge: Set Default Identity" }
      );
      if (!picked) return;
      selectedId = picked.identityId;
    }

    await this.bridge.setIdentity(selectedId, undefined, true);
    this.notifications.showInfo(`Identity '${selectedId}' is now the global default.`);
    this.triggerRefresh();
  }

  private async handleRemoveIdentity(targetId?: string): Promise<void> {
    const identities = this.bridge.loadIdentities();
    if (identities.length === 0) return;

    let selectedId = targetId;
    if (!selectedId) {
      const picked = await vscode.window.showQuickPick(
        identities.map((id) => ({
          label: id.name,
          description: id.email,
          identityId: id.id,
        })),
        { placeHolder: "Select identity to remove" }
      );
      if (!picked) return;
      selectedId = picked.identityId;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to remove identity '${selectedId}'?`,
      { modal: true },
      "Delete Identity"
    );

    if (confirm === "Delete Identity") {
      await this.bridge.removeIdentity(selectedId);
      this.notifications.showInfo(`Removed identity '${selectedId}'.`);
      this.triggerRefresh();
    }
  }

  private async handleFixMismatch(): Promise<void> {
    const cwd = this.contextService.getActiveWorkspaceFolder();
    if (!cwd) {
      this.notifications.showWarning("Open a Git workspace first.");
      return;
    }

    const res = await this.bridge.fixEmailMismatch(cwd);
    if (res.success) {
      this.notifications.showInfo(`Updated repository author to '${res.name} <${res.email}>'.`);
    } else {
      this.notifications.showError(res.error || "Failed to fix mismatch.");
    }
    this.triggerRefresh();
  }

  private async handleToggleSafetyHook(): Promise<void> {
    const cwd = this.contextService.getActiveWorkspaceFolder();
    if (!cwd) {
      this.notifications.showWarning("Open a Git repository first.");
      return;
    }

    const isInstalled = await this.bridge.isSafetyHookInstalled(cwd);
    if (isInstalled) {
      await this.bridge.uninstallSafetyHook(cwd);
      this.notifications.showInfo("Pre-commit safety guard uninstalled.");
    } else {
      await this.bridge.installSafetyHook(cwd);
      this.notifications.showInfo("Pre-commit safety guard installed! Your repository is now protected against email mismatches.");
    }
    this.triggerRefresh();
  }

  private async handleAddIdentity(): Promise<void> {
    const id = await this.notifications.promptInput({
      prompt: "Enter Identity ID (e.g. personal, work, client-x):",
      validateInput: (val) => (!val.trim() ? "Identity ID is required." : undefined),
    });
    if (!id) return;

    const name = await this.notifications.promptInput({
      prompt: "Enter Name for Git commits (e.g. Fuad Tesfaye):",
      validateInput: (val) => (!val.trim() ? "Name is required." : undefined),
    });
    if (!name) return;

    const email = await this.notifications.promptInput({
      prompt: "Enter Email for Git commits:",
      validateInput: (val) => (!val.includes("@") ? "Valid email address is required." : undefined),
    });
    if (!email) return;

    const signingKey = await this.notifications.promptInput({
      prompt: "Enter SSH/GPG Signing Key (optional, press Enter to skip):",
    });

    await this.bridge.addIdentity({
      id: id.trim(),
      name: name.trim(),
      email: email.trim(),
      signingKey: signingKey?.trim() || null,
    });

    this.notifications.showInfo(`Created identity '${id}'.`);
    this.triggerRefresh();
  }

  private async handleAddRule(): Promise<void> {
    const identities = this.bridge.loadIdentities();
    if (identities.length === 0) {
      this.notifications.showWarning("Create an identity before adding a directory rule.");
      return;
    }

    const cwd = this.contextService.getActiveWorkspaceFolder();

    // Offer native folder picker dialog
    const folderUris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: cwd ? vscode.Uri.file(cwd) : undefined,
      openLabel: "Select Directory for Rule",
      title: "GitBridge: Select Workspace Folder",
    });

    let selectedPath = folderUris && folderUris.length > 0 ? folderUris[0].fsPath : undefined;

    if (!selectedPath) {
      selectedPath = await this.notifications.promptInput({
        prompt: "Enter directory path to map:",
        value: cwd || "",
        validateInput: (val) => (!val.trim() ? "Directory path is required." : undefined),
      });
    }

    if (!selectedPath) return;

    const identityItems = identities.map((id) => ({
      label: id.name,
      description: id.email,
      identityId: id.id,
    }));

    const picked = await vscode.window.showQuickPick(identityItems, {
      placeHolder: "Select identity for this directory",
      title: "GitBridge: Assign Identity",
    });
    if (!picked) return;

    const cleanFolder = selectedPath.split(/[/\\]/).filter(Boolean).pop() || "custom";
    const ruleId = `rule_${cleanFolder}`;
    await this.bridge.addRule({
      id: ruleId,
      path: selectedPath,
      identityId: picked.identityId,
    });

    this.notifications.showInfo(`Directory rule created for '${selectedPath}'.`);
    this.triggerRefresh();
  }

  private async handleRemoveRule(ruleOrId?: DirectoryRule | string): Promise<void> {
    let ruleId: string | undefined;

    if (typeof ruleOrId === "string") {
      ruleId = ruleOrId;
    } else if (ruleOrId && "id" in ruleOrId) {
      ruleId = ruleOrId.id;
    } else {
      const rules = this.bridge.loadRules();
      if (rules.length === 0) {
        this.notifications.showInfo("No directory rules configured.");
        return;
      }

      const picked = await vscode.window.showQuickPick(
        rules.map((r) => ({
          label: r.path,
          description: `➔ ${r.identityId}`,
          ruleId: r.id,
        })),
        { placeHolder: "Select directory rule to delete" }
      );
      if (!picked) return;
      ruleId = picked.ruleId;
    }

    if (ruleId) {
      await this.bridge.removeRule(ruleId);
      this.notifications.showInfo("Directory rule deleted.");
      this.triggerRefresh();
    }
  }

  private async handleOpenDirectoryRule(rule?: DirectoryRule): Promise<void> {
    if (!rule || !rule.path) return;
    const uri = vscode.Uri.file(rule.path);
    await vscode.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: false });
  }

  private async handleInitRepo(): Promise<void> {
    const cwd = this.contextService.getActiveWorkspaceFolder();
    if (!cwd) {
      this.notifications.showWarning("Open a workspace folder first to initialize a repository profile.");
      return;
    }

    const identities = this.bridge.loadIdentities();
    if (identities.length === 0) {
      await this.handleAddIdentity();
      return;
    }

    const picked = await vscode.window.showQuickPick(
      identities.map((id) => ({
        label: id.name,
        description: id.email,
        identityId: id.id,
      })),
      { placeHolder: "Select Git identity for this repository" }
    );
    if (!picked) return;

    await this.bridge.setIdentity(picked.identityId, cwd, false);
    this.notifications.showInfo(`Repository initialized with identity '${picked.identityId}'.`);
    this.triggerRefresh();
  }

  private async handleAuthLogin(): Promise<void> {
    const provider = await vscode.window.showQuickPick(
      [
        { label: "$(github) GitHub", value: "github" },
        { label: "$(git-merge) GitLab", value: "gitlab" },
        { label: "$(repo-forked) Bitbucket", value: "bitbucket" },
      ],
      { placeHolder: "Select Git Provider to connect" }
    );
    if (!provider) return;

    const token = await vscode.window.showInputBox({
      prompt: `Enter Personal Access Token (PAT) for ${provider.label}:`,
      password: true,
      validateInput: (val) => (!val.trim() ? "Token cannot be empty." : undefined),
    });
    if (!token) return;

    try {
      this.notifications.showInfo(`Connecting ${provider.label}...`);
      const terminal = vscode.window.createTerminal("GitBridge Auth");
      terminal.show();
      terminal.sendText(`gitbridge auth login ${provider.value} --token "${token}"`);
      this.triggerRefresh();
    } catch (err: unknown) {
      this.notifications.showError(err instanceof Error ? err.message : String(err));
    }
  }

  private async handleAuthLogout(): Promise<void> {
    const accounts = this.bridge.loadAccounts();
    if (accounts.length === 0) {
      this.notifications.showInfo("No accounts connected.");
      return;
    }

    const picked = await vscode.window.showQuickPick(
      accounts.map((acc) => ({
        label: `@${acc.username}`,
        description: acc.providerId.toUpperCase(),
        accountId: acc.id,
      })),
      { placeHolder: "Select account to disconnect" }
    );
    if (!picked) return;

    await this.bridge.removeAccount(picked.accountId);
    this.notifications.showInfo(`Disconnected account '${picked.label}'.`);
    this.triggerRefresh();
  }

  private async handlePushAll(): Promise<void> {
    const cwd = this.contextService.getActiveWorkspaceFolder();
    if (!cwd) {
      this.notifications.showWarning("Open a Git repository first.");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "GitBridge: Pushing to all remotes...",
        cancellable: false,
      },
      async () => {
        try {
          const results = await this.bridge.pushAll(cwd);
          const successCount = results.filter((r) => r.success).length;
          if (successCount === results.length) {
            this.notifications.showInfo(`Successfully pushed to all ${results.length} remotes!`);
          } else {
            this.notifications.showWarning(`Pushed to ${successCount}/${results.length} remotes.`);
          }
        } catch (err: unknown) {
          this.notifications.showError(err instanceof Error ? err.message : String(err));
        }
      }
    );
  }

  private async handleDoctor(): Promise<void> {
    this.outputChannel.clear();
    this.outputChannel.show(true);
    this.outputChannel.appendLine("Running GitBridge System Diagnostics...\n");

    const report = await this.bridge.runDiagnostics();
    this.outputChannel.appendLine(report);
    this.notifications.showInfo("Diagnostics complete. See GitBridge Output panel.");
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.outputChannel.dispose();
  }
}
