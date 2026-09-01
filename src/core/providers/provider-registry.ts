import type { GitProvider } from "./provider.interface";
import type { GitProviderType } from "../config/schema";
import { GitHubProvider } from "./github.provider";
import { GitLabProvider } from "./gitlab.provider";
import { BitbucketProvider } from "./bitbucket.provider";

export class ProviderRegistry {
  private providers = new Map<string, GitProvider>();

  constructor() {
    this.register(new GitHubProvider());
    this.register(new GitLabProvider());
    this.register(new BitbucketProvider());
  }

  register(provider: GitProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(idOrType: GitProviderType | string): GitProvider | undefined {
    return this.providers.get(idOrType);
  }

  getByHost(host: string): GitProvider | undefined {
    const clean = host.toLowerCase();
    if (clean.includes("github.com") || clean.startsWith("github")) {
      return this.providers.get("github");
    }
    if (clean.includes("gitlab.com") || clean.startsWith("gitlab")) {
      return this.providers.get("gitlab");
    }
    if (clean.includes("bitbucket.org") || clean.startsWith("bitbucket")) {
      return this.providers.get("bitbucket");
    }
    // Search custom registered hosts
    for (const provider of this.providers.values()) {
      if (provider.defaultHost === host) {
        return provider;
      }
    }
    return undefined;
  }

  list(): GitProvider[] {
    return Array.from(this.providers.values());
  }
}

export const defaultProviderRegistry = new ProviderRegistry();
