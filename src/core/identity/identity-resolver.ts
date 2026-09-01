import path from "node:path";
import { ConfigStore } from "../config/config-store";
import { GitCli, type GitRemoteInfo } from "../git/git-cli";
import { expandTilde } from "@/utils/platform";
import type { GitIdentity, ProviderAccount, DirectoryRule, RepositoryProfile } from "../config/schema";

export type ResolutionSource = "repo_profile" | "directory_rule" | "global_default" | "system_fallback" | "unconfigured";

export interface ResolvedContext {
  cwd: string;
  isGitRepo: boolean;
  repoRoot: string | null;
  source: ResolutionSource;
  identity: GitIdentity | null;
  account: ProviderAccount | null;
  matchedRule: DirectoryRule | null;
  repoProfile: RepositoryProfile | null;
  remotes: GitRemoteInfo[];
  localGitEmail: string | null;
  localGitName: string | null;
  isMismatched: boolean;
}

export class IdentityResolver {
  private store: ConfigStore;

  constructor(store: ConfigStore) {
    this.store = store;
  }

  async resolve(cwd: string = process.cwd()): Promise<ResolvedContext> {
    const git = new GitCli(cwd);
    const isGitRepo = await git.isGitRepo();
    const repoRoot = isGitRepo ? await git.getRepoRoot() : null;
    const targetPath = repoRoot || path.resolve(cwd);

    const identities = this.store.loadIdentities();
    const accounts = this.store.loadAccounts();
    const rules = this.store.loadRules();
    const config = this.store.loadConfig();

    let localGitEmail: string | null = null;
    let localGitName: string | null = null;
    let remotes: GitRemoteInfo[] = [];

    if (isGitRepo) {
      localGitEmail = await git.getConfig("user.email");
      localGitName = await git.getConfig("user.name");
      remotes = await git.getRemotes();
    }

    let resolvedIdentity: GitIdentity | null = null;
    let resolvedAccount: ProviderAccount | null = null;
    let matchedRule: DirectoryRule | null = null;
    let repoProfile: RepositoryProfile | null = null;
    let source: ResolutionSource = "unconfigured";

    // 1. Check Repository Profile (explicitly saved in repos.json for targetPath or repoRoot)
    repoProfile = this.store.getRepository(targetPath) || (repoRoot ? this.store.getRepository(repoRoot) : null) || null;
    if (repoProfile && repoProfile.identityId) {
      const found = identities.find((i) => i.id === repoProfile!.identityId);
      if (found) {
        resolvedIdentity = found;
        source = "repo_profile";
      }
    }

    // 2. Check Directory Rules (longest prefix match)
    if (!resolvedIdentity) {
      let bestMatchLength = -1;
      for (const rule of rules) {
        const expandedRulePath = path.resolve(expandTilde(rule.path));
        if (targetPath === expandedRulePath || targetPath.startsWith(expandedRulePath + path.sep)) {
          if (expandedRulePath.length > bestMatchLength) {
            bestMatchLength = expandedRulePath.length;
            matchedRule = rule;
          }
        }
      }

      if (matchedRule) {
        const found = identities.find((i) => i.id === matchedRule!.identityId);
        if (found) {
          resolvedIdentity = found;
          source = "directory_rule";
          if (matchedRule.defaultAccountId) {
            resolvedAccount = accounts.find((a) => a.id === matchedRule!.defaultAccountId) || null;
          }
        }
      }
    }

    // 3. Check Global Default Identity
    if (!resolvedIdentity) {
      const defaultId = config.defaultIdentityId || identities.find((i) => i.isDefault)?.id;
      if (defaultId) {
        resolvedIdentity = identities.find((i) => i.id === defaultId) || null;
        if (resolvedIdentity) {
          source = "global_default";
        }
      }
    }

    // 4. If no identity is found, check if Git has a system/user identity configured
    if (!resolvedIdentity && localGitEmail) {
      source = "system_fallback";
    }

    // Resolve Account if not resolved yet
    if (!resolvedAccount && remotes.length > 0) {
      // Find account matching the first remote's host or account alias
      const firstRemote = remotes[0];
      const parsed = firstRemote.parsedPush || firstRemote.parsedFetch;
      if (parsed) {
        if (parsed.accountAlias) {
          resolvedAccount = accounts.find((a) => a.id === parsed.accountAlias || a.username === parsed.accountAlias) || null;
        }
        if (!resolvedAccount) {
          resolvedAccount = accounts.find((a) => a.host === parsed.host) || null;
        }
      }
    }

    // Check for mismatch (e.g. if localGitEmail is set and differs from resolved identity)
    let isMismatched = false;
    if (resolvedIdentity && localGitEmail && localGitEmail !== resolvedIdentity.email) {
      isMismatched = true;
    }

    return {
      cwd,
      isGitRepo,
      repoRoot,
      source,
      identity: resolvedIdentity,
      account: resolvedAccount,
      matchedRule,
      repoProfile,
      remotes,
      localGitEmail,
      localGitName,
      isMismatched,
    };
  }
}
