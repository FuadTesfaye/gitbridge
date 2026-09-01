import { GitCli } from "@/core/git/git-cli";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { parseRemoteUrl, buildSshUrl } from "@/core/git/url-parser";
import { renderRemotesTable } from "../ui/tables";
import { logger } from "@/utils/logger";
import pc from "picocolors";
import type { RepositoryRemote, RepositoryProfile } from "@/core/config/schema";

export async function handleRemoteList() {
  const git = new GitCli();
  if (!(await git.isGitRepo())) {
    logger.error("Current directory is not a Git repository.");
    return;
  }

  const remotes = await git.getRemotes();
  console.log(pc.bold("\n  GIT REMOTES"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(renderRemotesTable(remotes));
}

export async function handleRemoteAdd(
  name: string,
  url: string,
  options: { account?: string } = {},
  store: ConfigStore = defaultConfigStore
) {
  const git = new GitCli();
  if (!(await git.isGitRepo())) {
    logger.error("Current directory is not a Git repository.");
    return;
  }

  const parsed = parseRemoteUrl(url);
  if (!parsed) {
    logger.error("Invalid remote URL format.");
    return;
  }

  let finalUrl = url;
  if (options.account && parsed.protocol === "ssh") {
    finalUrl = buildSshUrl(parsed.host, parsed.owner, parsed.repo, options.account);
  }

  await git.setRemoteUrl(name, finalUrl);

  // Update repository profile in repos.json
  const repoRoot = await git.getRepoRoot();
  if (repoRoot) {
    const existing = store.getRepository(repoRoot);
    const remotes: RepositoryRemote[] = existing ? [...existing.remotes] : [];
    const existingIdx = remotes.findIndex((r) => r.name === name);
    const remoteData: RepositoryRemote = {
      name,
      providerId: parsed.providerId,
      host: parsed.host,
      accountId: options.account,
      url: finalUrl,
      rawUrl: url,
    };

    if (existingIdx >= 0) {
      remotes[existingIdx] = remoteData;
    } else {
      remotes.push(remoteData);
    }

    const profile: RepositoryProfile = {
      path: repoRoot,
      identityId: existing?.identityId,
      remotes,
      safetyHookInstalled: existing?.safetyHookInstalled || false,
      updatedAt: new Date().toISOString(),
    };

    store.saveRepositoryProfile(profile);
  }

  logger.success(`Remote '${name}' added: ${finalUrl}`);
}
