import fs from "node:fs";
import path from "node:path";
import { GitCli } from "../git/git-cli";
import { ConfigStore, defaultConfigStore } from "../config/config-store";
import { SshKeyDetector } from "../ssh/ssh-key-detector";
import { parseRemoteUrl } from "../git/url-parser";
import { getHomeDir } from "@/utils/platform";
import type { GitProviderType } from "../config/schema";

export interface DetectedProviderSummary {
  providerId: GitProviderType;
  name: string;
  host: string;
  detected: boolean;
  sources: string[];
}

export interface RemoteDetectionResult {
  providerId: GitProviderType;
  name: string;
  host: string;
  confidence: number;
  isKnown: boolean;
}

export interface SystemEnvironmentDiscovery {
  gitInstalled: boolean;
  gitVersion: string | null;
  sshKeysFound: string[];
  detectedProviders: DetectedProviderSummary[];
  existingGitUser: { name?: string; email?: string } | null;
}

export class ProviderDetector {
  private store: ConfigStore;

  constructor(store: ConfigStore = defaultConfigStore) {
    this.store = store;
  }

  /**
   * Detects the provider and host from a remote URL.
   */
  detectFromRemote(url: string): RemoteDetectionResult {
    const parsed = parseRemoteUrl(url);
    if (!parsed) {
      return { providerId: "custom", name: "Unknown", host: "", confidence: 0, isKnown: false };
    }
    const host = parsed.host.toLowerCase();

    // 1. Check known cloud providers
    if (host === "github.com" || host.includes("github")) {
      return { providerId: "github", name: "GitHub", host: parsed.host, confidence: 1.0, isKnown: true };
    }
    if (host === "gitlab.com" || host.includes("gitlab")) {
      return { providerId: "gitlab", name: "GitLab", host: parsed.host, confidence: 1.0, isKnown: true };
    }
    if (host === "bitbucket.org" || host.includes("bitbucket")) {
      return { providerId: "bitbucket", name: "Bitbucket", host: parsed.host, confidence: 1.0, isKnown: true };
    }

    // 2. Check accounts already registered in GitBridge
    const accounts = this.store.loadAccounts();
    const matchedAccount = accounts.find((a) => a.host.toLowerCase() === host || parsed.accountAlias === a.id);
    if (matchedAccount) {
      return {
        providerId: matchedAccount.providerId,
        name: matchedAccount.providerId.toUpperCase(),
        host: matchedAccount.host,
        confidence: 0.95,
        isKnown: true,
      };
    }

    // 3. Check custom IP / self-hosted heuristic (e.g. 172.27.23.116 or enterprise domain)
    return {
      providerId: "custom",
      name: `Custom (${parsed.host})`,
      host: parsed.host,
      confidence: 0.5,
      isKnown: false,
    };
  }

  /**
   * Broadly inspects system configuration (~/.gitconfig, ~/.ssh/config, ~/.git-credentials, local remotes)
   * to detect which Git providers the user actually interacts with.
   */
  async detectSystemProviders(): Promise<SystemEnvironmentDiscovery> {
    const home = getHomeDir();
    const git = new GitCli();
    const gitVersion = await git.getGitVersion();
    const sshKeys = SshKeyDetector.listAvailableKeys().map((k) => k.name);

    let existingGitName: string | undefined;
    let existingGitEmail: string | undefined;

    try {
      existingGitName = (await git.getConfig("user.name")) || undefined;
      existingGitEmail = (await git.getConfig("user.email")) || undefined;
    } catch {
      // Ignored
    }

    const providerMap = new Map<GitProviderType, { name: string; host: string; sources: Set<string> }>([
      ["github", { name: "GitHub", host: "github.com", sources: new Set() }],
      ["gitlab", { name: "GitLab", host: "gitlab.com", sources: new Set() }],
      ["bitbucket", { name: "Bitbucket", host: "bitbucket.org", sources: new Set() }],
    ]);

    // 1. Inspect ~/.gitconfig
    const gitConfigFile = path.join(home, ".gitconfig");
    if (fs.existsSync(gitConfigFile)) {
      try {
        const content = fs.readFileSync(gitConfigFile, "utf-8").toLowerCase();
        if (content.includes("github.com") || content.includes("github")) {
          providerMap.get("github")!.sources.add("~/.gitconfig");
        }
        if (content.includes("gitlab.com") || content.includes("gitlab") || content.includes("172.27.23.116") || content.includes("insa.gov.et")) {
          providerMap.get("gitlab")!.sources.add("~/.gitconfig");
        }
        if (content.includes("bitbucket.org") || content.includes("bitbucket")) {
          providerMap.get("bitbucket")!.sources.add("~/.gitconfig");
        }
      } catch {
        // Ignored
      }
    }

    // 2. Inspect ~/.ssh/config
    const sshConfigFile = path.join(home, ".ssh", "config");
    if (fs.existsSync(sshConfigFile)) {
      try {
        const content = fs.readFileSync(sshConfigFile, "utf-8").toLowerCase();
        if (content.includes("github.com")) providerMap.get("github")!.sources.add("~/.ssh/config");
        if (content.includes("gitlab.com") || content.includes("172.27.23.116")) providerMap.get("gitlab")!.sources.add("~/.ssh/config");
        if (content.includes("bitbucket.org")) providerMap.get("bitbucket")!.sources.add("~/.ssh/config");
      } catch {
        // Ignored
      }
    }

    // 3. Inspect ~/.git-credentials
    const gitCredsFile = path.join(home, ".git-credentials");
    if (fs.existsSync(gitCredsFile)) {
      try {
        const content = fs.readFileSync(gitCredsFile, "utf-8").toLowerCase();
        if (content.includes("github.com")) providerMap.get("github")!.sources.add("~/.git-credentials");
        if (content.includes("gitlab.com") || content.includes("172.27.23.116")) providerMap.get("gitlab")!.sources.add("~/.git-credentials");
        if (content.includes("bitbucket.org")) providerMap.get("bitbucket")!.sources.add("~/.git-credentials");
      } catch {
        // Ignored
      }
    }

    // 4. Inspect current working repository (if any)
    if (await git.isGitRepo()) {
      try {
        const remotes = await git.getRemotes();
        for (const r of remotes) {
          const remoteUrl = r.pushUrl || r.fetchUrl;
          if (remoteUrl) {
            const detected = this.detectFromRemote(remoteUrl);
            if (providerMap.has(detected.providerId)) {
              providerMap.get(detected.providerId)!.sources.add(`Current repository remote (${r.name})`);
            }
          }
        }
      } catch {
        // Ignored
      }
    }

    // 5. Inspect existing GitBridge accounts
    const accounts = this.store.loadAccounts();
    for (const a of accounts) {
      if (providerMap.has(a.providerId)) {
        providerMap.get(a.providerId)!.sources.add(`GitBridge account (${a.username})`);
      }
    }

    const detectedProviders: DetectedProviderSummary[] = Array.from(providerMap.entries()).map(([id, info]) => ({
      providerId: id,
      name: info.name,
      host: info.host,
      detected: info.sources.size > 0,
      sources: Array.from(info.sources),
    }));

    return {
      gitInstalled: Boolean(gitVersion),
      gitVersion,
      sshKeysFound: sshKeys,
      detectedProviders,
      existingGitUser: existingGitName || existingGitEmail ? { name: existingGitName, email: existingGitEmail } : null,
    };
  }
}
