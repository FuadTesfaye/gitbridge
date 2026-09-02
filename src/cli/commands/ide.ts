import pc from "picocolors";
import Table from "cli-table3";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { IdeSyncManager } from "@/core/ide/ide-sync-manager";
import { GitOverrideManager } from "@/core/git/override-manager";
import { logger } from "@/utils/logger";
import { formatBadge } from "../ui/banners";

export async function handleIdeSyncCommand(store: ConfigStore = defaultConfigStore) {
  const overrideManager = new GitOverrideManager(store);
  overrideManager.installShims();

  const ideManager = new IdeSyncManager(store);
  const result = ideManager.syncAll();

  logger.success("IDE settings synchronized with GitBridge successfully!");

  console.log(pc.bold("\n  SYNCHRONIZED IDE ENVIRONMENTS"));
  console.log("  ──────────────────────────────────────────────────");

  if (result.synced.length > 0) {
    for (const name of result.synced) {
      console.log(`  ${pc.green("✔")} ${pc.bold(name)}: ${pc.cyan("git.path & terminal env synced")}`);
    }
  } else {
    console.log(pc.yellow("  No installed IDE configuration directories were automatically detected."));
    console.log(pc.gray("  (You can configure 'git.path' manually to: ") + pc.cyan(store.getPathResolver().getGitShimPath()) + pc.gray(")"));
  }

  console.log(pc.green("\n✔ Built-in IDE Source Control GUI and integrated terminals are now linked!"));
  console.log(pc.gray("  • Commits made via the VS Code Source Control panel will automatically use GitBridge."));
  console.log(pc.gray("  • Open a new integrated terminal in your IDE to verify.\n"));
}

export async function handleIdeUnsyncCommand(store: ConfigStore = defaultConfigStore) {
  const ideManager = new IdeSyncManager(store);
  const result = ideManager.unsyncAll();

  logger.success("IDE settings unsynced successfully!");

  console.log(pc.bold("\n  UNSYNCED IDE ENVIRONMENTS"));
  console.log("  ──────────────────────────────────────────────────");

  if (result.unsynced.length > 0) {
    for (const name of result.unsynced) {
      console.log(`  ${pc.yellow("⚠")} ${pc.bold(name)}: ${pc.gray("Restored default Git configuration")}`);
    }
  } else {
    console.log(pc.gray("  No IDEs currently had GitBridge settings configured."));
  }

  console.log("");
}

export async function handleIdeStatusCommand(store: ConfigStore = defaultConfigStore) {
  const ideManager = new IdeSyncManager(store);
  const targets = ideManager.getIdeStatus();

  console.log(pc.bold("\n  IDE SYNCHRONIZATION STATUS"));
  console.log("  ──────────────────────────────────────────────────");

  const table = new Table({
    head: [pc.cyan("IDE"), pc.cyan("Installed"), pc.cyan("Status"), pc.cyan("Settings Path")],
    style: { head: [], border: [] },
  });

  for (const target of targets) {
    const installedText = target.installed ? pc.green("Yes") : pc.gray("No");
    const statusText = target.synced
      ? formatBadge("SYNCED", "green")
      : target.installed
      ? formatBadge("NOT SYNCED", "yellow")
      : formatBadge("NOT INSTALLED", "red");

    table.push([target.name, installedText, statusText, pc.gray(target.settingsPath)]);
  }

  console.log(table.toString());
  console.log(pc.gray("\n  • Run 'gitbridge ide sync' to automatically connect all detected IDEs."));
  console.log(pc.gray("  • Run 'gitbridge ide unsync' to restore native IDE settings.\n"));
}
