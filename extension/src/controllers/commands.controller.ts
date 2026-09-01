import * as vscode from "vscode";
import { BridgeService, bridgeService } from "../services/bridge.service";
import { GitContextService, gitContextService } from "../services/git-context.service";
import { NotificationService, notificationService } from "../services/notification.service";
import { COMMANDS } from "../constants";

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
    // 1. Switch Identity
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.SWITCH_IDENTITY, async (targetId?: string) => {
        await this.handleSwitchIdentity(targetId);
      })
    );

    // 2. Add Identity
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.ADD_IDENTITY, async () => {
        await this.handleAddIdentity();
      })
    );

    // 3. Add Rule
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.ADD_RULE, async () => {
        await this.handleAddRule();
      })
    );

    // 4. Init Repo
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.INIT_REPO, async () => {
        await this.handleInitRepo();
      })
    );

    // 5. Auth Login
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.AUTH_LOGIN, async () => {
        await this.handleAuthLogin();
      })
    );

    // 6. Auth Logout
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.AUTH_LOGOUT, async () => {
        await this.handleAuthLogout();
      })
    );

    // 7. Push All Remotes
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.PUSH_ALL, async () => {
        await this.handlePushAll();
      })
    );

    // 8. Doctor Diagnostics
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.DOCTOR, async () => {
        await this.handleDoctor();
      })
    );

    // 9. Enable / Disable
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.ENABLE, async () => {
        await this.bridge.enable();
        this.notifications.showInfo("GitBridge enabled in ~/.gitconfig and ~/.ssh/config.");
        this.triggerRefresh();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.DISABLE, async () => {
        await this.bridge.disable();
        this.notifications.showWarning("GitBridge integration disabled. Restored original Git config.");
        this.triggerRefresh();
      })
    );

    // 10. Refresh
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
    const dirPath = await this.notifications.promptInput({
      prompt: "Enter directory path to map:",
      value: cwd || "",
      validateInput: (val) => (!val.trim() ? "Directory path is required." : undefined),
    });
    if (!dirPath) return;

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

    const ruleId = `rule_${dirPath.split(/[/\\]/).filter(Boolean).pop() || "custom"}`;
    await this.bridge.addRule({
      id: ruleId,
      path: dirPath,
      identityId: picked.identityId,
    });

    this.notifications.showInfo(`Directory rule created for '${dirPath}'.`);
    this.triggerRefresh();
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
      // Use terminal or direct command bridge
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
