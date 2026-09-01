import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitCli } from "@/core/git/git-cli";
import { GitConfigGenerator } from "@/core/git/config-generator";
import { promptSelect } from "../ui/prompts";
import { logger } from "@/utils/logger";
import pc from "picocolors";
import type { RepositoryProfile } from "@/core/config/schema";

export async function handleSwitchCommand(
  targetIdentityId?: string,
  options: { global?: boolean } = {},
  store: ConfigStore = defaultConfigStore
) {
  const identities = store.loadIdentities();
  if (identities.length === 0) {
    logger.warn("No identities configured. Create one with 'gitbridge identity add'.");
    return;
  }

  let selectedId = targetIdentityId;
  if (!selectedId) {
    selectedId = await promptSelect({
      message: "Switch to identity:",
      options: identities.map((i) => ({
        value: i.id,
        label: `${i.id} (${i.name} <${i.email}>)`,
        hint: i.isDefault ? "current global default" : undefined,
      })),
    });
  }

  const identity = store.getIdentity(selectedId);
  if (!identity) {
    logger.error(`Identity '${selectedId}' not found.`);
    return;
  }

  const git = new GitCli();
  const isGitRepo = await git.isGitRepo();

  if (isGitRepo && !options.global) {
    await git.setConfig("user.name", identity.name, "local");
    await git.setConfig("user.email", identity.email, "local");
    if (identity.signingKey) {
      await git.setConfig("user.signingkey", identity.signingKey, "local");
    }

    const repoRoot = await git.getRepoRoot();
    if (repoRoot) {
      const existing = store.getRepository(repoRoot);
      const profile: RepositoryProfile = {
        path: repoRoot,
        identityId: identity.id,
        remotes: existing?.remotes || [],
        safetyHookInstalled: existing?.safetyHookInstalled || false,
        updatedAt: new Date().toISOString(),
      };
      store.saveRepositoryProfile(profile);
    }

    logger.success(`Switched repository identity to '${identity.id}'!`);
    console.log(pc.gray(`  Name:  ${identity.name}`));
    console.log(pc.gray(`  Email: ${identity.email}`));
    console.log(pc.gray("  Applied locally to current repository (.git/config)."));
  } else {
    store.setDefaultIdentity(identity.id);
    const generator = new GitConfigGenerator(store);
    generator.generate();

    logger.success(`Switched global default Git identity to '${identity.id}'!`);
    console.log(pc.gray(`  Name:  ${identity.name}`));
    console.log(pc.gray(`  Email: ${identity.email}`));
    console.log(pc.green("  Applied globally across GitBridge configuration."));
  }
}
