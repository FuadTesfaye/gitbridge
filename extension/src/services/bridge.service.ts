import { ConfigStore, defaultConfigStore } from "../../../src/core/config/config-store";
import { IdentityResolver, type ResolvedContext } from "../../../src/core/identity/identity-resolver";
import { GitCli } from "../../../src/core/git/git-cli";
import { GitConfigGenerator } from "../../../src/core/git/config-generator";
import { GitConfigInjector } from "../../../src/core/git/gitconfig-injector";
import { SshConfigGenerator } from "../../../src/core/ssh/ssh-config-generator";
import { SshInjector } from "../../../src/core/ssh/ssh-injector";
import { StoreFactory } from "../../../src/core/storage/store-factory";
import { defaultProviderRegistry } from "../../../src/core/providers/provider-registry";
import { SshKeyDetector } from "../../../src/core/ssh/ssh-key-detector";
import { IdentityGuard } from "../../../src/core/safety/identity-guard";
import type { GitIdentity, ProviderAccount, DirectoryRule, RepositoryProfile } from "../../../src/core/config/schema";

export class BridgeService {
  private store: ConfigStore;
  private resolver: IdentityResolver;
  private gitInjector: GitConfigInjector;
  private sshInjector: SshInjector;
  private gitGen: GitConfigGenerator;
  private sshGen: SshConfigGenerator;
  private guard: IdentityGuard;

  constructor(store: ConfigStore = defaultConfigStore) {
    this.store = store;
    this.resolver = new IdentityResolver(store);
    this.gitInjector = new GitConfigInjector(store);
    this.sshInjector = new SshInjector(store);
    this.gitGen = new GitConfigGenerator(store);
    this.sshGen = new SshConfigGenerator(store);
    this.guard = new IdentityGuard(store);
  }

  getStore(): ConfigStore {
    return this.store;
  }

  loadConfig() {
    return this.store.loadConfig();
  }

  loadIdentities(): GitIdentity[] {
    return this.store.loadIdentities();
  }

  loadAccounts(): ProviderAccount[] {
    return this.store.loadAccounts();
  }

  loadRules(): DirectoryRule[] {
    return this.store.loadRules();
  }

  loadRepositories(): RepositoryProfile[] {
    return this.store.loadRepositories();
  }

  async resolveContext(cwd?: string): Promise<ResolvedContext> {
    return this.resolver.resolve(cwd || process.cwd());
  }

  async setIdentity(identityId: string, cwd?: string, global = false): Promise<void> {
    const identity = this.store.getIdentity(identityId);
    if (!identity) throw new Error(`Identity '${identityId}' not found.`);

    if (cwd && !global) {
      const git = new GitCli(cwd);
      if (await git.isGitRepo()) {
        await git.setConfig("user.name", identity.name, "local");
        await git.setConfig("user.email", identity.email, "local");
        if (identity.signingKey) {
          await git.setConfig("user.signingkey", identity.signingKey, "local");
        }
        const repoRoot = await git.getRepoRoot();
        if (repoRoot) {
          const existing = this.store.getRepository(repoRoot);
          this.store.saveRepositoryProfile({
            path: repoRoot,
            identityId: identity.id,
            remotes: existing?.remotes || [],
            safetyHookInstalled: existing?.safetyHookInstalled || false,
          });
        }
        return;
      }
    }

    this.store.setDefaultIdentity(identityId);
    this.gitGen.generate();
  }

  async addIdentity(input: { id: string; name: string; email: string; signingKey?: string | null; isDefault?: boolean }): Promise<GitIdentity> {
    const created = this.store.addIdentity(input);
    this.gitGen.generate();
    return created;
  }

  async removeIdentity(id: string): Promise<boolean> {
    const res = this.store.removeIdentity(id);
    this.gitGen.generate();
    return res;
  }

  async addRule(rule: DirectoryRule): Promise<DirectoryRule> {
    const res = this.store.addRule(rule);
    this.gitGen.generate();
    return res;
  }

  async removeRule(idOrPath: string): Promise<boolean> {
    const res = this.store.removeRule(idOrPath);
    this.gitGen.generate();
    return res;
  }

  async removeAccount(id: string): Promise<void> {
    const account = this.store.getAccount(id);
    if (account) {
      const credStore = await StoreFactory.getStore(this.store.getPathResolver());
      await credStore.delete(account.host, account.id);
      this.store.removeAccount(id);
      this.sshGen.generate();
    }
  }

  async enable(): Promise<void> {
    this.store.setEnabled(true);
    this.gitInjector.inject();
    this.sshInjector.inject();
  }

  async disable(): Promise<void> {
    this.store.setEnabled(false);
    this.gitInjector.remove();
    this.sshInjector.remove();
  }

  isGitInstalled(): boolean {
    return this.gitInjector.isInstalled();
  }

  isSshInstalled(): boolean {
    return this.sshInjector.isInstalled();
  }

  async isSafetyHookInstalled(cwd?: string): Promise<boolean> {
    const git = new GitCli(cwd || process.cwd());
    const root = await git.getRepoRoot();
    if (!root) return false;
    return this.guard.isInstalled(root);
  }

  async installSafetyHook(cwd?: string): Promise<boolean> {
    const git = new GitCli(cwd || process.cwd());
    const root = await git.getRepoRoot();
    if (!root) return false;
    return this.guard.install(root);
  }

  async uninstallSafetyHook(cwd?: string): Promise<boolean> {
    const git = new GitCli(cwd || process.cwd());
    const root = await git.getRepoRoot();
    if (!root) return false;
    return this.guard.uninstall(root);
  }

  async fixEmailMismatch(cwd?: string): Promise<{ success: boolean; name?: string; email?: string; error?: string }> {
    const targetDir = cwd || process.cwd();
    const ctx = await this.resolveContext(targetDir);
    if (!ctx.isGitRepo) {
      return { success: false, error: "Not a git repository." };
    }
    if (!ctx.identity) {
      return { success: false, error: "No matching identity found for this directory." };
    }

    const git = new GitCli(targetDir);
    await git.setConfig("user.name", ctx.identity.name, "local");
    await git.setConfig("user.email", ctx.identity.email, "local");
    if (ctx.identity.signingKey) {
      await git.setConfig("user.signingkey", ctx.identity.signingKey, "local");
    }

    const root = await git.getRepoRoot();
    if (root) {
      const existing = this.store.getRepository(root);
      this.store.saveRepositoryProfile({
        path: root,
        identityId: ctx.identity.id,
        remotes: existing?.remotes || [],
        safetyHookInstalled: existing?.safetyHookInstalled || false,
      });
    }

    return { success: true, name: ctx.identity.name, email: ctx.identity.email };
  }

  async pushAll(cwd?: string): Promise<{ remote: string; success: boolean; error?: string }[]> {
    const git = new GitCli(cwd);
    const branch = await git.getCurrentBranch();
    if (!branch) throw new Error("No active Git branch found.");
    const remotes = await git.getRemotes();
    if (remotes.length === 0) throw new Error("No Git remotes configured.");

    const results = await Promise.allSettled(
      remotes.map(async (remote) => {
        try {
          await git.exec(["push", remote.name, branch]);
          return { remote: remote.name, success: true };
        } catch (err: unknown) {
          return { remote: remote.name, success: false, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );

    return results.map((r, i) => (r.status === "fulfilled" ? r.value : { remote: remotes[i].name, success: false, error: "Push failed" }));
  }

  async runDiagnostics(): Promise<string> {
    const git = new GitCli();
    const gitVersion = await git.getGitVersion();
    const credStore = await StoreFactory.getStore(this.store.getPathResolver());
    const sshKeys = SshKeyDetector.listAvailableKeys();
    const providers = defaultProviderRegistry.list();

    let output = `GitBridge System Diagnostics\n`;
    output += `──────────────────────────────────────────────────\n`;
    output += `Git CLI Version:        ${gitVersion || "Not found"}\n`;
    output += `Credential Storage:     ${credStore.name}\n`;
    output += `Git ~/.gitconfig:       ${this.gitInjector.isInstalled() ? "Active" : "Not enabled"}\n`;
    output += `SSH ~/.ssh/config:      ${this.sshInjector.isInstalled() ? "Active" : "Not enabled"}\n`;
    output += `Available SSH Keys:     ${sshKeys.map((k) => k.name).join(", ") || "None"}\n\n`;

    output += `Provider Connectivity:\n`;
    for (const p of providers) {
      const health = await p.checkHealth();
      output += `  • ${p.name} (${p.defaultHost}): ${health.apiOk ? `OK (${health.pingMs}ms)` : `Error: ${health.error || "Unreachable"}`}\n`;
    }

    return output;
  }
}

export const bridgeService = new BridgeService();
