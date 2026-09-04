import path from "node:path";
import fs from "node:fs";
import { ConfigStore, defaultConfigStore } from "../config/config-store";
import { defaultProviderRegistry } from "./provider-registry";
import { ProviderDetector } from "./provider-detector";
import { parseRemoteUrl, type ParsedRemoteUrl } from "../git/url-parser";
import { StoreFactory } from "../storage/store-factory";
import { expandTilde } from "@/utils/platform";
import type { GitIdentity, ProviderAccount, GitProviderType, DirectoryRule } from "../config/schema";

export type AccessDetectionTier =
  | "explicit_flag"
  | "directory_rule"
  | "namespace_match"
  | "token_api"
  | "ssh_key"
  | "prompt_fallback"
  | "unresolved";

export interface RepoAccessDetectionResult {
  matched: boolean;
  tier: AccessDetectionTier;
  account?: ProviderAccount;
  accountId?: string;
  identity?: GitIdentity;
  identityId?: string;
  email?: string;
  name?: string;
  providerId?: GitProviderType;
  host?: string;
  sshKeyPath?: string;
  reason: string;
  parsedUrl?: ParsedRemoteUrl | null;
}

export interface DetectAccessOptions {
  url: string;
  targetPath?: string;
  explicitIdentityId?: string;
  explicitAccountId?: string;
  explicitEmail?: string;
  interactive?: boolean;
}

export class RepoAccessDetector {
  private store: ConfigStore;

  constructor(store: ConfigStore = defaultConfigStore) {
    this.store = store;
  }

  async detectAccess(options: DetectAccessOptions): Promise<RepoAccessDetectionResult> {
    const { url, targetPath = process.cwd(), explicitIdentityId, explicitAccountId, explicitEmail } = options;
    const identities = this.store.loadIdentities();
    const accounts = this.store.loadAccounts();
    const cleanUrl = (url || "").trim();

    // 1. Priority 1: Explicit CLI Flags
    if (explicitIdentityId || explicitAccountId || explicitEmail) {
      let matchedIdentity: GitIdentity | undefined = undefined;
      if (explicitIdentityId) {
        matchedIdentity = identities.find((i) => i.id === explicitIdentityId);
      }
      if (!matchedIdentity && explicitEmail) {
        matchedIdentity = identities.find((i) => i.email.toLowerCase() === explicitEmail.toLowerCase());
      }
      const matchedAccount = explicitAccountId ? accounts.find((a) => a.id === explicitAccountId) : undefined;

      return {
        matched: Boolean(matchedIdentity || matchedAccount),
        tier: "explicit_flag",
        identity: matchedIdentity,
        identityId: matchedIdentity?.id || explicitIdentityId,
        account: matchedAccount,
        accountId: matchedAccount?.id || explicitAccountId,
        email: matchedIdentity?.email || explicitEmail,
        name: matchedIdentity?.name,
        providerId: matchedAccount?.providerId,
        host: matchedAccount?.host,
        sshKeyPath: matchedAccount?.sshKeyPath,
        reason: "Explicit CLI flag specified",
      };
    }

    // 2. Priority 2: Directory Rule Matching (Longest prefix match directly)
    // Direct check to avoid circular recursion with IdentityResolver
    const resolvedPath = path.resolve(targetPath);
    const rules = this.store.loadRules();
    let matchedRule: DirectoryRule | null = null;
    let bestRuleLength = -1;

    for (const rule of rules) {
      const expanded = path.resolve(expandTilde(rule.path));
      if (resolvedPath === expanded || resolvedPath.startsWith(expanded + path.sep)) {
        if (expanded.length > bestRuleLength) {
          bestRuleLength = expanded.length;
          matchedRule = rule;
        }
      }
    }

    if (matchedRule) {
      const ruleIdentity = identities.find((i) => i.id === matchedRule!.identityId);
      const ruleAccount = matchedRule.defaultAccountId
        ? accounts.find((a) => a.id === matchedRule!.defaultAccountId)
        : undefined;

      return {
        matched: true,
        tier: "directory_rule",
        identity: ruleIdentity,
        identityId: matchedRule.identityId,
        account: ruleAccount,
        accountId: matchedRule.defaultAccountId,
        email: ruleIdentity?.email,
        name: ruleIdentity?.name,
        providerId: matchedRule.defaultProvider || ruleAccount?.providerId,
        host: ruleAccount?.host,
        sshKeyPath: ruleAccount?.sshKeyPath,
        reason: `Matched directory rule '${matchedRule.id}' (${matchedRule.path})`,
      };
    }

    // 3. Parse Remote URL
    // Check if local bare repo / file system path
    const isLocalPath = fs.existsSync(cleanUrl) || cleanUrl.startsWith("file://");
    const parsed = parseRemoteUrl(cleanUrl);

    if (isLocalPath || !parsed || !parsed.host || parsed.host === "local" || !parsed.owner) {
      return {
        matched: false,
        tier: "unresolved",
        reason: "Local filesystem bare repo or unparseable remote URL",
        parsedUrl: parsed,
      };
    }

    // Identify provider
    const detector = new ProviderDetector(this.store);
    const detection = detector.detectFromRemote(cleanUrl);
    const providerId = detection.providerId;
    const host = detection.host;

    // Filter candidate accounts matching this provider / host
    const providerAccounts = accounts.filter(
      (a) => a.providerId === providerId || a.host === host || host.includes(a.host)
    );

    if (providerAccounts.length === 0) {
      return {
        matched: false,
        tier: "unresolved",
        providerId,
        host,
        reason: `No registered accounts found for provider '${providerId}' (${host})`,
        parsedUrl: parsed,
      };
    }

    // If URL has explicit account alias (e.g. github.com-work or git@github-personal)
    if (parsed.accountAlias) {
      const aliasAccount = providerAccounts.find(
        (a) => a.id === parsed.accountAlias || a.username === parsed.accountAlias
      );
      if (aliasAccount) {
        const id = this.resolveIdentityForAccount(aliasAccount, identities);
        return {
          matched: true,
          tier: "namespace_match",
          account: aliasAccount,
          accountId: aliasAccount.id,
          identity: id.identity,
          identityId: id.identity?.id,
          email: id.identity?.email || aliasAccount.email,
          name: id.identity?.name || aliasAccount.displayName,
          providerId,
          host: aliasAccount.host,
          sshKeyPath: aliasAccount.sshKeyPath,
          reason: `URL specifies account alias '${parsed.accountAlias}'`,
          parsedUrl: parsed,
        };
      }
    }

    // Strategy A: Namespace / Owner match
    // E.g. repo is FuadTesfaye/gitbridge, and an account has username "FuadTesfaye"
    const ownerSegments = parsed.owner.toLowerCase().split("/");
    const primaryOwner = ownerSegments[0];
    const namespaceAccount = providerAccounts.find(
      (a) => a.username.toLowerCase() === primaryOwner || ownerSegments.includes(a.username.toLowerCase())
    );

    if (namespaceAccount) {
      const id = this.resolveIdentityForAccount(namespaceAccount, identities);
      return {
        matched: true,
        tier: "namespace_match",
        account: namespaceAccount,
        accountId: namespaceAccount.id,
        identity: id.identity,
        identityId: id.identity?.id,
        email: id.identity?.email || namespaceAccount.email,
        name: id.identity?.name || namespaceAccount.displayName,
        providerId,
        host: namespaceAccount.host,
        sshKeyPath: namespaceAccount.sshKeyPath,
        reason: `Repository namespace owner match for '${namespaceAccount.username}'`,
        parsedUrl: parsed,
      };
    }

    // Strategy B: Token API Probe
    // Check credentials in OS Keyring / Vault and probe API access
    try {
      const credStore = await StoreFactory.getStore(this.store.getPathResolver());
      const provider = defaultProviderRegistry.get(providerId);

      if (provider && typeof provider.checkRepoAccess === "function") {
        for (const acc of providerAccounts) {
          try {
            const token = await credStore.get(acc.host, acc.id);
            if (token) {
              const accessRes = await provider.checkRepoAccess(token, parsed.owner, parsed.repo, acc.host);
              if (accessRes.hasAccess) {
                const id = this.resolveIdentityForAccount(acc, identities);
                return {
                  matched: true,
                  tier: "token_api",
                  account: acc,
                  accountId: acc.id,
                  identity: id.identity,
                  identityId: id.identity?.id,
                  email: id.identity?.email || acc.email,
                  name: id.identity?.name || acc.displayName,
                  providerId,
                  host: acc.host,
                  sshKeyPath: acc.sshKeyPath,
                  reason: `Verified provider API access for account '${acc.username}' (permission: ${accessRes.permission || "read"})`,
                  parsedUrl: parsed,
                };
              }
            }
          } catch {
            // Continue probing next account
          }
        }
      }
    } catch {
      // Keyring/API probe failed gracefully
    }

    // Strategy C: SSH Key check if SSH protocol
    if (parsed.protocol === "ssh") {
      const accountsWithKey = providerAccounts.filter(
        (a) => a.sshKeyPath && fs.existsSync(a.sshKeyPath)
      );
      if (accountsWithKey.length === 1) {
        const acc = accountsWithKey[0];
        const id = this.resolveIdentityForAccount(acc, identities);
        return {
          matched: true,
          tier: "ssh_key",
          account: acc,
          accountId: acc.id,
          identity: id.identity,
          identityId: id.identity?.id,
          email: id.identity?.email || acc.email,
          name: id.identity?.name || acc.displayName,
          providerId,
          host: acc.host,
          sshKeyPath: acc.sshKeyPath,
          reason: `Single active SSH key linked to account '${acc.username}'`,
          parsedUrl: parsed,
        };
      }
    }

    // If single account exists for provider, match it
    if (providerAccounts.length === 1) {
      const singleAcc = providerAccounts[0];
      const id = this.resolveIdentityForAccount(singleAcc, identities);
      return {
        matched: true,
        tier: "namespace_match",
        account: singleAcc,
        accountId: singleAcc.id,
        identity: id.identity,
        identityId: id.identity?.id,
        email: id.identity?.email || singleAcc.email,
        name: id.identity?.name || singleAcc.displayName,
        providerId,
        host: singleAcc.host,
        sshKeyPath: singleAcc.sshKeyPath,
        reason: `Single configured account for provider '${singleAcc.username}'`,
        parsedUrl: parsed,
      };
    }

    return {
      matched: false,
      tier: "prompt_fallback",
      providerId,
      host,
      reason: `Multiple accounts found for ${providerId} (${providerAccounts.length}); automated access probe inconclusive`,
      parsedUrl: parsed,
    };
  }

  private resolveIdentityForAccount(
    account: ProviderAccount,
    identities: GitIdentity[]
  ): { identity?: GitIdentity; synthesized: boolean } {
    // 1. Check account's explicit identityId
    if (account.identityId) {
      const found = identities.find((i) => i.id === account.identityId);
      if (found) return { identity: found, synthesized: false };
    }

    // 2. Check account's email
    if (account.email) {
      const found = identities.find((i) => i.email.toLowerCase() === account.email!.toLowerCase());
      if (found) return { identity: found, synthesized: false };
    }

    // 3. Check identity matching username or account id
    const foundById = identities.find(
      (i) => i.id.toLowerCase() === account.username.toLowerCase() || i.id === account.id
    );
    if (foundById) return { identity: foundById, synthesized: false };

    // 4. Check global default identity
    const config = this.store.loadConfig();
    const defaultId = config.defaultIdentityId || identities.find((i) => i.isDefault)?.id;
    if (defaultId) {
      const defaultIdent = identities.find((i) => i.id === defaultId);
      if (defaultIdent) return { identity: defaultIdent, synthesized: false };
    }

    // 5. If account has email or username, synthesize an identity
    if (account.email) {
      const synthesized: GitIdentity = {
        id: account.username,
        name: account.displayName || account.username,
        email: account.email,
        signingKey: null,
        isDefault: false,
        createdAt: new Date().toISOString(),
      };
      return { identity: synthesized, synthesized: true };
    }

    if (identities.length > 0) {
      return { identity: identities[0], synthesized: false };
    }

    return { synthesized: false };
  }
}
