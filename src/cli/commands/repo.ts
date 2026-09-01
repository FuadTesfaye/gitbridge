import path from "node:path";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitCli } from "@/core/git/git-cli";
import { IdentityGuard } from "@/core/safety/identity-guard";
import { promptSelect, promptConfirm } from "../ui/prompts";
import { logger } from "@/utils/logger";
import pc from "picocolors";
import type { RepositoryRemote } from "@/core/config/schema";

export async function handleRepoInit(store: ConfigStore = defaultConfigStore) {
  const cwd = process.cwd();
  const git = new GitCli(cwd);

  let isGitRepo = await git.isGitRepo();
  if (!isGitRepo) {
    const initialize = await promptConfirm({
      message: `Current directory is not a Git repository. Run 'git init'?`,
      initialValue: true,
    });
    if (initialize) {
      await git.exec(["init"]);
      isGitRepo = true;
    } else {
      logger.warn("Initialization aborted.");
      return;
    }
  }

  const repoRoot = (await git.getRepoRoot()) || cwd;
  const repoName = path.basename(repoRoot);

  console.log(pc.bold(`\n  CONFIGURING REPOSITORY: ${pc.cyan(repoName)}`));
  console.log(pc.gray(`  Path: ${repoRoot}\n`));

  const identities = store.loadIdentities();
  const accounts = store.loadAccounts();

  if (identities.length === 0) {
    logger.warn("No GitBridge identities configured yet. Run 'gitbridge identity add' first.");
    return;
  }

  // 1. Select Identity
  const selectedIdentityId = await promptSelect({
    message: "Select Git identity for this repository:",
    options: identities.map((i) => ({
      value: i.id,
      label: `${i.id} (${i.name} <${i.email}>)`,
    })),
  });

  const identity = store.getIdentity(selectedIdentityId)!;

  // Set local git config user.name and user.email
  await git.setConfig("user.name", identity.name, "local");
  await git.setConfig("user.email", identity.email, "local");
  if (identity.signingKey) {
    await git.setConfig("user.signingkey", identity.signingKey, "local");
  }

  // 2. Configure Remotes
  const existingRemotes = await git.getRemotes();
  const repositoryRemotes: RepositoryRemote[] = [];

  if (existingRemotes.length > 0) {
    console.log(pc.bold("\n  Detected Remotes:"));
    for (const r of existingRemotes) {
      const parsed = r.parsedPush || r.parsedFetch;
      console.log(`    • ${pc.cyan(r.name)}: ${r.fetchUrl}`);

      if (parsed) {
        let accountId = parsed.accountAlias;
        if (!accountId && accounts.length > 0) {
          const matching = accounts.find((a) => a.host === parsed.host);
          if (matching) {
            accountId = matching.id;
          }
        }

        repositoryRemotes.push({
          name: r.name,
          providerId: parsed.providerId,
          host: parsed.host,
          accountId,
          url: r.fetchUrl,
          rawUrl: r.fetchUrl,
        });
      }
    }
  }

  // 3. Optional Pre-Commit Identity Guard
  const installHook = await promptConfirm({
    message: "Install GitBridge pre-commit identity guard hook in this repo?",
    initialValue: true,
  });

  if (installHook) {
    const guard = new IdentityGuard(store);
    await guard.installPreCommitHook(repoRoot);
  }

  // 4. Save Repository Profile
  store.saveRepositoryProfile({
    path: repoRoot,
    identityId: selectedIdentityId,
    remotes: repositoryRemotes,
    safetyHookInstalled: installHook,
  });

  logger.success(`Repository '${repoName}' initialized with GitBridge!`);
  console.log(pc.gray(`  Identity: ${identity.name} <${identity.email}>`));
  console.log(pc.gray(`  Pre-commit guard: ${installHook ? pc.green("installed") : pc.gray("skipped")}`));
  console.log(pc.green("\nYou can now make commits and push normally with native Git!\n"));
}
