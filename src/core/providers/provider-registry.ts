import type { GitProvider, ProviderInstallationState, ProviderStatus } from "./provider.interface";
import type { GitProviderType } from "../config/schema";
import { GitHubProvider } from "./github.provider";
import { GitLabProvider } from "./gitlab.provider";
import { BitbucketProvider } from "./bitbucket.provider";
import { ConfigStore, defaultConfigStore } from "../config/config-store";

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
    const clean = host.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
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
      if (provider.defaultHost.toLowerCase() === clean) {
        return provider;
      }
    }
    return undefined;
  }

  /**
   * Returns all providers supported by the engine.
   */
  listSupported(): GitProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Default alias for backward compatibility.
   */
  list(): GitProvider[] {
    return this.listSupported();
  }

  /**
   * Returns only providers enabled by the user in config.json.
   * If a provider has active accounts, it is enabled by default.
   */
  listEnabled(store: ConfigStore = defaultConfigStore): GitProvider[] {
    const config = store.loadConfig();
    const accounts = store.loadAccounts();

    return this.listSupported().filter((p) => {
      const pConfig = config.providers?.[p.id];
      if (pConfig !== undefined) {
        return pConfig.enabled;
      }
      // If accounts exist for this provider, treat as enabled
      const hasAccounts = accounts.some((a) => a.providerId === p.id);
      if (hasAccounts) return true;

      // Default: github is enabled by default, others are available until selected
      return p.id === "github";
    });
  }

  isProviderEnabled(id: string, store: ConfigStore = defaultConfigStore): boolean {
    const config = store.loadConfig();
    const pConfig = config.providers?.[id];
    if (pConfig !== undefined) {
      return pConfig.enabled;
    }
    const accounts = store.loadAccounts();
    return accounts.some((a) => a.providerId === id) || id === "github";
  }

  enableProvider(id: string, store: ConfigStore = defaultConfigStore): void {
    const current = store.loadConfig();
    const currentProviders = current.providers || {};
    const existing = currentProviders[id] || { enabled: true };
    store.saveConfig({
      providers: {
        ...currentProviders,
        [id]: { ...existing, enabled: true },
      },
    });
  }

  disableProvider(id: string, store: ConfigStore = defaultConfigStore): void {
    const current = store.loadConfig();
    const currentProviders = current.providers || {};
    const existing = currentProviders[id] || { enabled: false };
    store.saveConfig({
      providers: {
        ...currentProviders,
        [id]: { ...existing, enabled: false },
      },
    });
  }

  getInstallationState(providerId: string, store: ConfigStore = defaultConfigStore): ProviderInstallationState {
    const provider = this.get(providerId);
    if (!provider) {
      throw new Error(`Unknown provider: '${providerId}'`);
    }

    const accounts = store.loadAccounts().filter((a) => a.providerId === providerId);
    const enabled = this.isProviderEnabled(providerId, store);
    const configured = accounts.length > 0;

    let status: ProviderStatus = "available";
    if (enabled && configured) {
      status = "authenticated";
    } else if (enabled) {
      status = "enabled";
    }

    return {
      providerId: provider.id,
      name: provider.name,
      defaultHost: provider.defaultHost,
      status,
      enabled,
      configured,
      accountCount: accounts.length,
      capabilities: provider.capabilities,
    };
  }

  listStates(store: ConfigStore = defaultConfigStore): ProviderInstallationState[] {
    return this.listSupported().map((p) => this.getInstallationState(p.id, store));
  }
}

export const defaultProviderRegistry = new ProviderRegistry();
