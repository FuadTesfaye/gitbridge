import path from "node:path";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitConfigGenerator } from "@/core/git/config-generator";
import { renderRulesTable } from "../ui/tables";
import { promptSelect, promptText } from "../ui/prompts";
import { collapseTilde, expandTilde } from "@/utils/platform";
import { logger } from "@/utils/logger";
import pc from "picocolors";
import type { GitProviderType } from "@/core/config/schema";

export async function handleRuleList(store: ConfigStore = defaultConfigStore) {
  const rules = store.loadRules();

  console.log(pc.bold("\n  DIRECTORY ROUTING RULES"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(renderRulesTable(rules));
}

export async function handleRuleAdd(
  dirPath?: string,
  identityId?: string,
  options: { id?: string; provider?: string; account?: string } = {},
  store: ConfigStore = defaultConfigStore
) {
  const identities = store.loadIdentities();
  const accounts = store.loadAccounts();

  if (identities.length === 0) {
    logger.warn("No identities found. Please create an identity first with 'gitbridge identity add'.");
    return;
  }

  let targetPath = dirPath;
  if (!targetPath) {
    targetPath = await promptText({
      message: "Enter the directory path to map (e.g. ~/Projects/company or /path/to/work):",
      validate: (val) => (!val || !val.trim() ? "Directory path is required." : undefined),
    });
  }

  targetPath = collapseTilde(path.resolve(expandTilde(targetPath.trim())));

  let targetIdentity = identityId;
  if (!targetIdentity) {
    targetIdentity = await promptSelect({
      message: `Select identity to assign to '${targetPath}':`,
      options: identities.map((i) => ({
        value: i.id,
        label: `${i.id} (${i.name} <${i.email}>)`,
      })),
    });
  }

  const ruleId = options.id || `rule_${path.basename(targetPath).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  let defaultProvider: GitProviderType | undefined = options.provider as GitProviderType | undefined;
  let defaultAccountId = options.account;

  if (accounts.length > 0 && !defaultAccountId) {
    const matchingAccounts = accounts.filter((a) => a.username.includes(targetIdentity!) || a.id.includes(targetIdentity!));
    if (matchingAccounts.length > 0) {
      defaultAccountId = matchingAccounts[0].id;
      defaultProvider = matchingAccounts[0].providerId;
    }
  }

  store.addRule({
    id: ruleId,
    path: targetPath,
    identityId: targetIdentity,
    defaultProvider,
    defaultAccountId,
  });

  const generator = new GitConfigGenerator(store);
  generator.generate();

  logger.success(`Directory rule '${ruleId}' added successfully!`);
  console.log(pc.gray(`  Path:      ${targetPath}`));
  console.log(pc.gray(`  Identity:  ${targetIdentity}`));
  if (defaultAccountId) {
    console.log(pc.gray(`  Account:   ${defaultAccountId}`));
  }
  console.log(pc.green("  Git includeIf rules regenerated."));
  console.log("");
}

export async function handleRuleRemove(idOrPath: string, store: ConfigStore = defaultConfigStore) {
  const removed = store.removeRule(idOrPath);
  if (!removed) {
    logger.error(`Rule '${idOrPath}' not found.`);
    return;
  }

  const generator = new GitConfigGenerator(store);
  generator.generate();

  logger.success(`Directory rule '${idOrPath}' removed.`);
}
