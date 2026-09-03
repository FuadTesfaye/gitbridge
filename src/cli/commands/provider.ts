import Table from "cli-table3";
import pc from "picocolors";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { promptSelect } from "../ui/prompts";
import { logger } from "@/utils/logger";
import { formatBadge } from "../ui/banners";

export async function handleProviderList(store: ConfigStore = defaultConfigStore) {
  const states = defaultProviderRegistry.listStates(store);

  console.log(pc.bold("\n  GIT PROVIDERS"));
  console.log("  ──────────────────────────────────────────────────");

  const table = new Table({
    head: [pc.bold("ID"), pc.bold("Name"), pc.bold("Default Host"), pc.bold("Status"), pc.bold("Accounts"), pc.bold("Capabilities")],
    style: { head: ["cyan"] },
  });

  for (const s of states) {
    let statusBadge: string;
    if (s.status === "authenticated") {
      statusBadge = formatBadge("AUTHENTICATED", "green");
    } else if (s.status === "enabled") {
      statusBadge = formatBadge("ENABLED", "cyan");
    } else {
      statusBadge = pc.gray("AVAILABLE");
    }

    const caps: string[] = [];
    if (s.capabilities.oauth) caps.push("OAuth");
    if (s.capabilities.deviceCode) caps.push("Device");
    if (s.capabilities.tokenAuth) caps.push("PAT");
    if (s.capabilities.passwordAuth) caps.push("Password");
    if (s.capabilities.sshKeys) caps.push("SSH");
    if (s.capabilities.selfHosted) caps.push("Self-Hosted");

    table.push([
      pc.cyan(s.providerId),
      s.name,
      pc.gray(s.defaultHost),
      statusBadge,
      s.accountCount > 0 ? pc.green(String(s.accountCount)) : pc.gray("0"),
      pc.gray(caps.join(", ")),
    ]);
  }

  console.log(table.toString());
  console.log(pc.gray("\n  • Run 'gb provider enable <id>' or 'gb provider disable <id>' to manage active providers."));
  console.log(pc.gray("  • Run 'gb auth login <id>' to authenticate an account.\n"));
}

export async function handleProviderEnable(providerId?: string, store: ConfigStore = defaultConfigStore) {
  if (!providerId) {
    logger.error("Please specify provider ID to enable (e.g. 'gb provider enable gitlab')");
    return;
  }

  const cleanId = providerId.toLowerCase();
  const provider = defaultProviderRegistry.get(cleanId);
  if (!provider) {
    logger.error(`Unknown provider: '${providerId}'. Available: ${defaultProviderRegistry.listSupported().map((p) => p.id).join(", ")}`);
    return;
  }

  defaultProviderRegistry.enableProvider(cleanId, store);
  logger.success(`Provider '${provider.name}' is now enabled!`);
  console.log(pc.gray(`  GitBridge will now manage and detect ${provider.name} repositories.`));
  console.log(pc.cyan(`  Run 'gb auth login ${cleanId}' to connect an account.\n`));
}

export async function handleProviderDisable(providerId?: string, store: ConfigStore = defaultConfigStore) {
  if (!providerId) {
    logger.error("Please specify provider ID to disable (e.g. 'gb provider disable bitbucket')");
    return;
  }

  const cleanId = providerId.toLowerCase();
  const provider = defaultProviderRegistry.get(cleanId);
  if (!provider) {
    logger.error(`Unknown provider: '${providerId}'.`);
    return;
  }

  defaultProviderRegistry.disableProvider(cleanId, store);
  logger.success(`Provider '${provider.name}' is now disabled.`);
  console.log(pc.gray(`  (Existing accounts and credentials were preserved and will not be loaded).\n`));
}

export async function handleProviderAdd(store: ConfigStore = defaultConfigStore) {
  const supported = defaultProviderRegistry.listSupported();
  const selected = await promptSelect({
    message: "Select a Git provider to enable and configure:",
    options: supported.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.defaultHost})`,
      hint: defaultProviderRegistry.isProviderEnabled(p.id, store) ? "Already enabled" : "Available",
    })),
  });

  defaultProviderRegistry.enableProvider(selected, store);
  logger.success(`Enabled provider: '${selected}'`);
}
