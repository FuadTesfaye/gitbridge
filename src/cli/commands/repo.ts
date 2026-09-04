import path from "node:path";
import fs from "node:fs";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitCli } from "@/core/git/git-cli";
import { IdentityGuard } from "@/core/safety/identity-guard";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { promptSelect, promptConfirm } from "../ui/prompts";
import { logger } from "@/utils/logger";
import pc from "picocolors";
import Table from "cli-table3";
import type { RepositoryRemote, GitProviderType } from "@/core/config/schema";

export interface RepoSetOptions {
  identity?: string;
  email?: string;
  provider?: string;
  account?: string;
}

export async function handleRepoSet(
  targetPathArg?: string,
  options: RepoSetOptions = {},
  store: ConfigStore = defaultConfigStore
) {
  const targetDir = path.resolve(targetPathArg || process.cwd());
  const git = new GitCli(targetDir);

  const isGitRepo = await git.isGitRepo();
  if (!isGitRepo) {
    logger.error(`The path '${targetDir}' is not a Git repository.`);
    return;
  }

  const repoRoot = (await git.getRepoRoot()) || targetDir;
  const repoName = path.basename(repoRoot);
  const identities = store.loadIdentities();
  const accounts = store.loadAccounts();

  if (identities.length === 0) {
    logger.error("No GitBridge identities configured. Run 'gb identity add' first.");
    return;
  }

  // 1. Resolve Identity
  let identity = options.identity
    ? identities.find((i) => i.id === options.identity || i.email === options.identity)
    : null;

  if (!identity && options.email) {
    identity = identities.find((i) => i.email.toLowerCase() === options.email?.toLowerCase());
  }

  if (!identity) {
    // Check if directory matches an active Directory Rule
    const resolver = new IdentityResolver(store);
    const matchedCtx = await resolver.resolve(repoRoot);

    if (matchedCtx.matchedRule && matchedCtx.identity && !options.identity && !options.email) {
      identity = matchedCtx.identity;
      console.log(`  Auto-Selected from Directory Rule (${matchedCtx.matchedRule.id}): ${pc.bold(identity.name)} <${pc.green(identity.email)}>`);
    } else {
      if (options.identity || options.email) {
        logger.warn(`Could not find configured identity for '${options.identity || options.email}'.`);
      }

      const selectedId = await promptSelect({
        message: `Select Git identity to bind permanently to ${pc.cyan(repoName)}:`,
        options: identities.map((i) => ({
          value: i.id,
          label: `${i.id} (${i.name} <${i.email}>)`,
        })),
      });
      identity = store.getIdentity(selectedId)!;
    }
  }

  // 2. Resolve Provider & Account
  const remotes = await git.getRemotes();
  const primaryRemote = remotes[0];
  let targetProvider = options.provider || (primaryRemote?.parsedPush?.providerId || primaryRemote?.parsedFetch?.providerId);
  let targetAccount = options.account;

  if (!targetAccount && targetProvider && accounts.length > 0) {
    const matchingAccounts = accounts.filter(
      (a) => a.providerId.toLowerCase() === targetProvider?.toLowerCase()
    );
    if (matchingAccounts.length === 1) {
      targetAccount = matchingAccounts[0].id;
    } else if (matchingAccounts.length > 1 && !options.identity) {
      targetAccount = await promptSelect({
        message: `Select ${targetProvider} account for this repository:`,
        options: matchingAccounts.map((a) => ({
          value: a.id,
          label: `${a.username} (${a.host}) [${a.id}]`,
        })),
      });
    }
  }

  // 3. Set Local Git Config
  await git.setConfig("user.name", identity.name, "local");
  await git.setConfig("user.email", identity.email, "local");
  if (identity.signingKey) {
    await git.setConfig("user.signingkey", identity.signingKey, "local");
  }

  // 4. Save to .git/gitbridge.json (Tier 1 Local Override)
  const gitDir = path.join(repoRoot, ".git");
  if (fs.existsSync(gitDir)) {
    const localConfigPath = path.join(gitDir, "gitbridge.json");
    const localData = {
      profile: identity.id,
      identityId: identity.id,
      providerId: targetProvider as GitProviderType | undefined,
      accountId: targetAccount,
    };
    fs.writeFileSync(localConfigPath, JSON.stringify(localData, null, 2), { encoding: "utf-8", mode: 0o600 });
  }

  // 5. Save to repos.json (Tier 2 Global Registry)
  const repositoryRemotes: RepositoryRemote[] = remotes.map((r) => {
    const parsed = r.parsedPush || r.parsedFetch;
    return {
      name: r.name,
      providerId: (targetProvider as GitProviderType) || parsed?.providerId || "custom",
      host: parsed?.host || "unknown",
      accountId: targetAccount || parsed?.accountAlias,
      url: r.fetchUrl,
      rawUrl: r.fetchUrl,
    };
  });

  store.saveRepositoryProfile({
    path: repoRoot,
    identityId: identity.id,
    remotes: repositoryRemotes,
    safetyHookInstalled: true,
  });

  // 6. Install safety hooks
  const guard = new IdentityGuard(store);
  await guard.installPreCommitHook(repoRoot);
  await guard.installPrePushHook(repoRoot);

  console.log(pc.bold("\n  ✔ REPOSITORY PERMANENTLY BOUND"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(`  Repository:   ${pc.cyan(repoName)} (${repoRoot})`);
  console.log(`  Identity:     ${pc.bold(identity.name)} <${pc.green(identity.email)}> [${identity.id}]`);
  if (targetProvider) {
    console.log(`  Provider:     ${pc.green(targetProvider.toUpperCase())}`);
  }
  if (targetAccount) {
    console.log(`  Account:      ${pc.magenta(targetAccount)}`);
  }
  console.log(`  Saved To:     ${pc.gray(".git/gitbridge.json & ~/.gitbridge/repos.json")}`);
  console.log(`  Safety Hooks: ${pc.green("✔ Active (pre-commit & pre-push)")}`);
  console.log(pc.cyan("\n  GitBridge will automatically remember this configuration forever without asking again.\n"));
}

export async function handleRepoList(store: ConfigStore = defaultConfigStore) {
  const repos = store.loadRepositories();
  const identities = store.loadIdentities();

  console.log(pc.bold("\n  REMEMBERED REPOSITORY PROFILES"));
  console.log(pc.gray("  ──────────────────────────────────────────────────"));

  if (repos.length === 0) {
    console.log(pc.yellow("  No repositories explicitly bound yet."));
    console.log(pc.gray("  Use 'gb repo set' or 'gb init' inside a repository to bind it permanently.\n"));
    return;
  }

  const table = new Table({
    head: [
      pc.cyan("Repository"),
      pc.cyan("Path"),
      pc.cyan("Identity"),
      pc.cyan("Email"),
      pc.cyan("Provider"),
      pc.cyan("Account"),
    ],
  });

  for (const r of repos) {
    const name = path.basename(r.path);
    const id = identities.find((i) => i.id === r.identityId);
    const remote = r.remotes && r.remotes[0];
    table.push([
      pc.bold(name),
      pc.gray(r.path),
      id ? id.name : pc.gray(r.identityId),
      id ? pc.green(id.email) : pc.gray("unknown"),
      remote ? pc.cyan(remote.providerId.toUpperCase()) : pc.gray("auto"),
      remote?.accountId ? pc.magenta(remote.accountId) : pc.gray("default"),
    ]);
  }

  console.log(table.toString() + "\n");
}

export async function handleRepoUnset(
  targetPathArg?: string,
  store: ConfigStore = defaultConfigStore
) {
  const targetDir = path.resolve(targetPathArg || process.cwd());
  const repoRoot = targetDir;
  const repoName = path.basename(repoRoot);

  // Remove .git/gitbridge.json if exists
  const localConfig = path.join(repoRoot, ".git", "gitbridge.json");
  if (fs.existsSync(localConfig)) {
    try {
      fs.unlinkSync(localConfig);
    } catch {
      // ignore
    }
  }

  // Remove from repos.json
  const repos = store.loadRepositories();
  const filtered = repos.filter((r) => path.resolve(r.path) !== path.resolve(repoRoot));
  store.saveRepositories(filtered);

  console.log(pc.green(`\n✔ Removed GitBridge repository binding for '${repoName}' (${repoRoot}).\n`));
}

export async function handleRepoInit(store: ConfigStore = defaultConfigStore) {
  return handleRepoSet(undefined, {}, store);
}
