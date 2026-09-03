import fs from "node:fs";
import path from "node:path";
import { PathResolver, defaultPathResolver } from "./path-resolver";
import {
  MainConfigSchema,
  IdentitiesFileSchema,
  AccountsFileSchema,
  RepositoriesFileSchema,
  type MainConfig,
  type GitIdentity,
  type ProviderAccount,
  type DirectoryRule,
  type RepositoryProfile,
  type GitBridgeSettings,
} from "./schema";
import { ConfigError } from "@/utils/errors";

export interface CreateIdentityInput {
  id: string;
  name: string;
  email: string;
  signingKey?: string | null;
  isDefault?: boolean;
}

export interface CreateAccountInput {
  id: string;
  providerId: ProviderAccount["providerId"];
  host: string;
  username: string;
  displayName?: string;
  authType: ProviderAccount["authType"];
  sshKeyPath?: string;
}

export interface SaveRepositoryProfileInput {
  path: string;
  identityId?: string;
  remotes?: RepositoryProfile["remotes"];
  safetyHookInstalled?: boolean;
}

export class ConfigStore {
  private paths: PathResolver;

  constructor(paths: PathResolver = defaultPathResolver) {
    this.paths = paths;
  }

  getPathResolver(): PathResolver {
    return this.paths;
  }

  ensureDirectories(): void {
    const dirs = [
      this.paths.getBaseDir(),
      this.paths.getGeneratedDir(),
      this.paths.getRulesDir(),
      this.paths.getBackupsDir(),
      this.paths.getShimsDir(),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      try {
        fs.chmodSync(dir, 0o700);
      } catch {
        // ignore on Windows
      }
    }
  }

  private atomicWriteJson(filepath: string, data: unknown): void {
    this.ensureDirectories();
    const tempFile = `${filepath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempFile, content, { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tempFile, filepath);
    try {
      fs.chmodSync(filepath, 0o600);
    } catch {
      // ignore on Windows
    }
  }

  // --- Main Config ---
  loadConfig(): MainConfig {
    const file = this.paths.getConfigFile();
    if (!fs.existsSync(file)) {
      return MainConfigSchema.parse({});
    }
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      return MainConfigSchema.parse(raw);
    } catch (err: unknown) {
      throw new ConfigError(`Failed to load config from ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  saveConfig(config: Partial<MainConfig>): MainConfig {
    const current = this.loadConfig();
    const merged = MainConfigSchema.parse({ ...current, ...config });
    this.atomicWriteJson(this.paths.getConfigFile(), merged);
    return merged;
  }

  updateSettings(settings: Partial<GitBridgeSettings>): MainConfig {
    const current = this.loadConfig();
    const updated = {
      ...current,
      settings: { ...current.settings, ...settings },
    };
    return this.saveConfig(updated);
  }

  setEnabled(enabled: boolean): MainConfig {
    return this.saveConfig({ enabled });
  }

  setOverrideEnabled(overrideEnabled: boolean): MainConfig {
    return this.updateSettings({ overrideEnabled });
  }

  isOverrideEnabled(): boolean {
    return this.loadConfig().settings.overrideEnabled ?? false;
  }

  getRealGitPath(): string | null {
    return this.loadConfig().settings.realGitPath || null;
  }

  setRealGitPath(realGitPath: string): MainConfig {
    return this.updateSettings({ realGitPath });
  }

  // --- Identities ---
  loadIdentities(): GitIdentity[] {
    const file = this.paths.getIdentitiesFile();
    if (!fs.existsSync(file)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      const parsed = IdentitiesFileSchema.parse(raw);
      return parsed.identities;
    } catch (err: unknown) {
      throw new ConfigError(`Failed to load identities from ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  saveIdentities(identities: GitIdentity[]): void {
    const validated = IdentitiesFileSchema.parse({ identities });
    this.atomicWriteJson(this.paths.getIdentitiesFile(), validated);
  }

  getIdentity(id: string): GitIdentity | undefined {
    const list = this.loadIdentities();
    return list.find((i) => i.id === id);
  }

  addIdentity(identity: CreateIdentityInput): GitIdentity {
    const list = this.loadIdentities();
    if (list.some((i) => i.id === identity.id)) {
      throw new ConfigError(`Identity with ID '${identity.id}' already exists.`);
    }

    const isFirst = list.length === 0;
    const newIdentity: GitIdentity = {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      signingKey: identity.signingKey || null,
      isDefault: identity.isDefault ?? isFirst,
      createdAt: new Date().toISOString(),
    };

    if (newIdentity.isDefault) {
      list.forEach((i) => {
        i.isDefault = false;
      });
      this.saveConfig({ defaultIdentityId: newIdentity.id });
    }

    list.push(newIdentity);
    this.saveIdentities(list);
    return newIdentity;
  }

  updateIdentity(id: string, updates: Partial<CreateIdentityInput>): GitIdentity {
    const list = this.loadIdentities();
    const index = list.findIndex((i) => i.id === id);
    if (index === -1) {
      throw new ConfigError(`Identity with ID '${id}' not found.`);
    }

    if (updates.isDefault) {
      list.forEach((i) => {
        i.isDefault = false;
      });
      this.saveConfig({ defaultIdentityId: id });
    }

    const updated: GitIdentity = {
      ...list[index],
      ...updates,
      signingKey: updates.signingKey !== undefined ? updates.signingKey : list[index].signingKey,
    };

    list[index] = updated;
    this.saveIdentities(list);
    return updated;
  }

  removeIdentity(id: string): boolean {
    const list = this.loadIdentities();
    const filtered = list.filter((i) => i.id !== id);
    if (filtered.length === list.length) {
      return false;
    }

    const config = this.loadConfig();
    if (config.defaultIdentityId === id) {
      const nextDefault = filtered[0]?.id ?? null;
      if (filtered[0]) filtered[0].isDefault = true;
      this.saveConfig({ defaultIdentityId: nextDefault });
    }

    this.saveIdentities(filtered);
    return true;
  }

  setDefaultIdentity(id: string): void {
    const list = this.loadIdentities();
    const target = list.find((i) => i.id === id);
    if (!target) {
      throw new ConfigError(`Identity with ID '${id}' not found.`);
    }

    list.forEach((i) => {
      i.isDefault = i.id === id;
    });
    this.saveIdentities(list);
    this.saveConfig({ defaultIdentityId: id });
  }

  // --- Accounts ---
  loadAccounts(): ProviderAccount[] {
    const file = this.paths.getAccountsFile();
    if (!fs.existsSync(file)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      const parsed = AccountsFileSchema.parse(raw);
      return parsed.accounts;
    } catch (err: unknown) {
      throw new ConfigError(`Failed to load accounts from ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  saveAccounts(accounts: ProviderAccount[]): void {
    const validated = AccountsFileSchema.parse({ accounts });
    this.atomicWriteJson(this.paths.getAccountsFile(), validated);
  }

  getAccount(id: string): ProviderAccount | undefined {
    return this.loadAccounts().find((a) => a.id === id);
  }

  addAccount(account: CreateAccountInput): ProviderAccount {
    const list = this.loadAccounts();
    const existingIndex = list.findIndex((a) => a.id === account.id);
    const newAccount: ProviderAccount = {
      ...account,
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      list[existingIndex] = newAccount;
    } else {
      list.push(newAccount);
    }

    this.saveAccounts(list);
    return newAccount;
  }

  removeAccount(id: string): boolean {
    const list = this.loadAccounts();
    const filtered = list.filter((a) => a.id !== id);
    if (filtered.length === list.length) {
      return false;
    }
    this.saveAccounts(filtered);
    return true;
  }

  // --- Directory Rules ---
  loadRules(): DirectoryRule[] {
    return this.loadConfig().rules;
  }

  addRule(rule: DirectoryRule): DirectoryRule {
    const config = this.loadConfig();
    const existingIndex = config.rules.findIndex((r) => r.id === rule.id || r.path === rule.path);
    if (existingIndex >= 0) {
      config.rules[existingIndex] = rule;
    } else {
      config.rules.push(rule);
    }
    this.saveConfig(config);
    return rule;
  }

  removeRule(ruleIdOrPath: string): boolean {
    const config = this.loadConfig();
    const initialLen = config.rules.length;
    config.rules = config.rules.filter((r) => r.id !== ruleIdOrPath && r.path !== ruleIdOrPath);
    if (config.rules.length === initialLen) {
      return false;
    }
    this.saveConfig(config);
    return true;
  }

  // --- Repository Profiles ---
  loadRepositories(): RepositoryProfile[] {
    const file = this.paths.getReposFile();
    if (!fs.existsSync(file)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      const parsed = RepositoriesFileSchema.parse(raw);
      return parsed.repositories;
    } catch (err: unknown) {
      throw new ConfigError(`Failed to load repositories from ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  saveRepositories(repositories: RepositoryProfile[]): void {
    const validated = RepositoriesFileSchema.parse({ repositories });
    this.atomicWriteJson(this.paths.getReposFile(), validated);
  }

  getRepository(repoPath: string): RepositoryProfile | undefined {
    const normalized = path.resolve(repoPath);
    return this.loadRepositories().find((r) => path.resolve(r.path) === normalized);
  }

  saveRepositoryProfile(profile: SaveRepositoryProfileInput): RepositoryProfile {
    const list = this.loadRepositories();
    const normalized = path.resolve(profile.path);
    const existingIndex = list.findIndex((r) => path.resolve(r.path) === normalized);
    const updatedProfile: RepositoryProfile = {
      path: normalized,
      identityId: profile.identityId,
      remotes: profile.remotes || [],
      safetyHookInstalled: profile.safetyHookInstalled || false,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      list[existingIndex] = updatedProfile;
    } else {
      list.push(updatedProfile);
    }

    this.saveRepositories(list);
    return updatedProfile;
  }

  removeRepositoryProfile(repoPath: string): boolean {
    const list = this.loadRepositories();
    const normalized = path.resolve(repoPath);
    const filtered = list.filter((r) => path.resolve(r.path) !== normalized);
    if (filtered.length === list.length) {
      return false;
    }
    this.saveRepositories(filtered);
    return true;
  }
}

export const defaultConfigStore = new ConfigStore();
