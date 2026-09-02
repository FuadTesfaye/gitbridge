import * as vscode from "vscode";
import { BridgeService, bridgeService } from "./services/bridge.service";
import { GitContextService, gitContextService } from "./services/git-context.service";
import {
  ContextTreeDataProvider,
  IdentitiesTreeDataProvider,
  AccountsTreeDataProvider,
  RulesTreeDataProvider,
} from "./providers/tree-data.provider";
import { StatusBarController } from "./controllers/status-bar.controller";
import { WatcherController } from "./controllers/watcher.controller";
import { CommandsController } from "./controllers/commands.controller";
import { VIEWS } from "./constants";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Providers
  const contextProvider = new ContextTreeDataProvider(bridgeService, gitContextService);
  const identitiesProvider = new IdentitiesTreeDataProvider(bridgeService, gitContextService);
  const accountsProvider = new AccountsTreeDataProvider(bridgeService);
  const rulesProvider = new RulesTreeDataProvider(bridgeService);

  // Register Tree Views (Activity Bar and Source Control Panel)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(VIEWS.CONTEXT, contextProvider),
    vscode.window.registerTreeDataProvider(VIEWS.SCM_CONTEXT, contextProvider),
    vscode.window.registerTreeDataProvider(VIEWS.IDENTITIES, identitiesProvider),
    vscode.window.registerTreeDataProvider(VIEWS.ACCOUNTS, accountsProvider),
    vscode.window.registerTreeDataProvider(VIEWS.RULES, rulesProvider)
  );

  // 2. Status Bar
  const statusBar = new StatusBarController(bridgeService, gitContextService);
  context.subscriptions.push(statusBar);
  await statusBar.update();

  // Function to refresh all UI
  const refreshAll = () => {
    contextProvider.refresh();
    identitiesProvider.refresh();
    accountsProvider.refresh();
    rulesProvider.refresh();
    statusBar.update();
  };

  // 3. Commands Controller
  const commandsController = new CommandsController(
    bridgeService,
    gitContextService,
    undefined as any,
    refreshAll
  );
  context.subscriptions.push(commandsController);

  // 4. State & File Watcher
  const watcher = new WatcherController(bridgeService);
  context.subscriptions.push(watcher);
  watcher.onDidChange(() => {
    refreshAll();
  });
}

export function deactivate(): void {
  // cleanup
}
