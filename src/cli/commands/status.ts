import pc from "picocolors";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitConfigInjector } from "@/core/git/gitconfig-injector";
import { SshInjector } from "@/core/ssh/ssh-injector";
import { formatBadge, showBanner } from "../ui/banners";
import { renderIdentitiesTable, renderAccountsTable, renderRulesTable } from "../ui/tables";

export async function handleStatusCommand(store: ConfigStore = defaultConfigStore) {
  showBanner();

  const config = store.loadConfig();
  const identities = store.loadIdentities();
  const accounts = store.loadAccounts();
  const rules = store.loadRules();

  const gitInjector = new GitConfigInjector(store);
  const sshInjector = new SshInjector(store);

  const gitInstalled = gitInjector.isInstalled();
  const sshInstalled = sshInjector.isInstalled();

  console.log(pc.bold("  STATUS OVERVIEW"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(`  GitBridge Mode:         ${config.enabled ? formatBadge("ENABLED", "green") : formatBadge("DISABLED", "red")}`);
  console.log(`  Git Extension Block:    ${gitInstalled ? pc.green("✔ Active in ~/.gitconfig") : pc.yellow("⚠ Not installed (run 'gitbridge enable')")}`);
  console.log(`  SSH Extension Block:    ${sshInstalled ? pc.green("✔ Active in ~/.ssh/config") : pc.gray("○ Not installed")}`);
  console.log(`  Default Identity:       ${config.defaultIdentityId ? pc.cyan(config.defaultIdentityId) : pc.gray("none")}`);
  console.log("");

  console.log(pc.bold("  IDENTITIES"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(renderIdentitiesTable(identities, config.defaultIdentityId));
  console.log("");

  console.log(pc.bold("  AUTHENTICATED PROVIDER ACCOUNTS"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(renderAccountsTable(accounts));
  console.log("");

  console.log(pc.bold("  DIRECTORY RULES"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(renderRulesTable(rules));
  console.log("");
}
