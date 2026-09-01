import * as vscode from "vscode";
import { BridgeService, bridgeService } from "../services/bridge.service";
import { GitContextService, gitContextService } from "../services/git-context.service";
import { COMMANDS } from "../constants";

export class StatusBarController implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor(
    private bridge: BridgeService = bridgeService,
    private contextService: GitContextService = gitContextService
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = COMMANDS.SWITCH_IDENTITY;
  }

  async update(): Promise<void> {
    const config = vscode.workspace.getConfiguration("gitbridge");
    const enabled = config.get<boolean>("statusBar.enabled", true);
    const showEmail = config.get<boolean>("statusBar.showEmail", true);

    if (!enabled) {
      this.item.hide();
      return;
    }

    const cwd = this.contextService.getActiveWorkspaceFolder();
    const ctx = await this.bridge.resolveContext(cwd);

    if (!ctx.identity) {
      this.item.text = "$(person) GitBridge: No Identity";
      this.item.tooltip = "Click to configure or switch GitBridge identity";
      this.item.backgroundColor = undefined;
      this.item.show();
      return;
    }

    let text = `$(person) ${ctx.identity.id}`;
    if (showEmail) {
      text += `: ${ctx.identity.email}`;
    }

    if (ctx.account) {
      let icon = "$(organization)";
      if (ctx.account.providerId === "github") icon = "$(github)";
      else if (ctx.account.providerId === "gitlab") icon = "$(git-merge)";
      text += ` ${icon} @${ctx.account.username}`;
    }

    if (ctx.isMismatched) {
      text = `$(alert) ${text} [Mismatch]`;
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      this.item.backgroundColor = undefined;
    }

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`### GitBridge Context\n\n`);
    tooltip.appendMarkdown(`- **Active Identity**: \`${ctx.identity.name} <${ctx.identity.email}>\`\n`);
    tooltip.appendMarkdown(`- **Identity ID**: \`${ctx.identity.id}\`\n`);
    tooltip.appendMarkdown(`- **Resolution Source**: \`${ctx.source.replace("_", " ").toUpperCase()}\`\n`);
    if (ctx.account) {
      tooltip.appendMarkdown(`- **Provider Account**: \`@${ctx.account.username}\` (${ctx.account.providerId})\n`);
    }
    if (ctx.isGitRepo) {
      tooltip.appendMarkdown(`- **Local Git Email**: \`${ctx.localGitEmail || "Not set"}\`\n`);
      if (ctx.isMismatched) {
        tooltip.appendMarkdown(`\n> ⚠️ **Warning**: Local \`.git/config\` email does not match the active GitBridge rule!\n`);
      }
    }
    tooltip.appendMarkdown(`\n---\n*Click to switch identity or configure GitBridge*`);

    this.item.text = text;
    this.item.tooltip = tooltip;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
