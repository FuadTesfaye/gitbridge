import ora from "ora";
import pc from "picocolors";
import { GitCli } from "@/core/git/git-cli";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitConfigInjector } from "@/core/git/gitconfig-injector";
import { SshInjector } from "@/core/ssh/ssh-injector";
import { GitOverrideManager } from "@/core/git/override-manager";
import { IdeSyncManager } from "@/core/ide/ide-sync-manager";
import { SshKeyDetector } from "@/core/ssh/ssh-key-detector";
import { StoreFactory } from "@/core/storage/store-factory";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { getPlatform } from "@/utils/platform";

export async function handleDoctorCommand(store: ConfigStore = defaultConfigStore) {
  console.log(pc.bold("\n  GITBRIDGE DOCTOR - SYSTEM DIAGNOSTICS"));
  console.log("  ──────────────────────────────────────────────────");

  const git = new GitCli();
  const gitInjector = new GitConfigInjector(store);
  const sshInjector = new SshInjector(store);
  const overrideManager = new GitOverrideManager(store);
  const ideManager = new IdeSyncManager(store);

  // 1. Core Tooling
  const gitVersion = await git.getGitVersion();
  const runtime = typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node.js ${process.version}`;
  const platform = getPlatform();

  console.log(pc.bold("  1. Toolchain & Environment"));
  if (gitVersion) {
    console.log(`     ${pc.green("✔")} Git CLI:            ${pc.cyan(gitVersion)}`);
  } else {
    console.log(`     ${pc.red("✖")} Git CLI:            ${pc.red("Not found on PATH")}`);
  }

  console.log(`     ${pc.green("✔")} Runtime:            ${pc.cyan(runtime)}`);
  console.log(`     ${pc.green("✔")} Platform:           ${pc.cyan(platform)} (${process.arch})`);

  // 2. Integration Blocks & Git Override
  console.log(pc.bold("\n  2. Git, SSH & Native Override Integrations"));
  const gitInstalled = gitInjector.isInstalled();
  const sshInstalled = sshInjector.isInstalled();
  const overrideStatus = overrideManager.getOverrideStatus();

  if (overrideStatus.enabled && overrideStatus.shimsInstalled) {
    console.log(`     ${pc.green("✔")} Native Override:    ${pc.green("Active (git -> gitbridge proxy)")}`);
  } else if (overrideStatus.enabled) {
    console.log(`     ${pc.yellow("⚠")} Native Override:    ${pc.yellow("Enabled but shims missing (run 'gitbridge override enable')")}`);
  } else {
    console.log(`     ${pc.gray("○")} Native Override:    ${pc.gray("Disabled (run 'gitbridge override enable')")}`);
  }

  if (gitInstalled) {
    console.log(`     ${pc.green("✔")} ~/.gitconfig:      ${pc.green("Managed block active")}`);
  } else {
    console.log(`     ${pc.yellow("⚠")} ~/.gitconfig:      ${pc.yellow("Not enabled (run 'gitbridge enable')")}`);
  }

  if (sshInstalled) {
    console.log(`     ${pc.green("✔")} ~/.ssh/config:      ${pc.green("Include directive active")}`);
  } else {
    console.log(`     ${pc.gray("○")} ~/.ssh/config:      ${pc.gray("Not enabled")}`);
  }

  // 2.1 IDE Integrations
  const ideTargets = ideManager.getIdeStatus();
  const syncedIdes = ideTargets.filter((t) => t.synced).map((t) => t.name);
  if (syncedIdes.length > 0) {
    console.log(`     ${pc.green("✔")} IDE Sync:           ${pc.green(`Active for: ${syncedIdes.join(", ")}`)}`);
  } else {
    console.log(`     ${pc.gray("○")} IDE Sync:           ${pc.gray("Not synced (run 'gitbridge ide sync')")}`);
  }

  // 3. Credential Store Backend
  console.log(pc.bold("\n  3. Secure Credential Storage"));
  const credStore = await StoreFactory.getStore(store.getPathResolver());
  const storeAvailable = await credStore.isAvailable();
  if (storeAvailable) {
    console.log(`     ${pc.green("✔")} Active Backend:    ${pc.cyan(credStore.name)}`);
  } else {
    console.log(`     ${pc.red("✖")} Active Backend:    ${pc.red("Unavailable")}`);
  }

  // 4. SSH Keys
  const sshKeys = SshKeyDetector.listAvailableKeys();
  console.log(pc.bold("\n  4. Discovered SSH Keys"));
  if (sshKeys.length > 0) {
    for (const key of sshKeys) {
      console.log(`     ${pc.green("✔")} ${key.name}: ${pc.gray(key.publicKeyPath)} (${key.type})`);
    }
  } else {
    console.log(`     ${pc.gray("○")} No .pub keys found in ~/.ssh`);
  }

  // 5. Provider API Health
  console.log(pc.bold("\n  5. Provider Connectivity"));
  const providers = defaultProviderRegistry.list();

  for (const provider of providers) {
    const spinner = ora(`     Checking ${provider.name} (${provider.defaultHost})...`).start();
    const health = await provider.checkHealth();
    if (health.apiOk) {
      spinner.succeed(`    ${pc.green("✔")} ${provider.name}: API reachable (${health.pingMs}ms)`);
    } else {
      spinner.warn(`    ${pc.yellow("⚠")} ${provider.name}: ${health.error || "Unreachable"}`);
    }
  }

  // 6. Active Repository & Identity Consistency
  const resolver = new IdentityResolver(store);
  const ctx = await resolver.resolve();
  if (ctx.isGitRepo) {
    console.log(pc.bold("\n  6. Repository & Identity Consistency"));
    console.log(`     ${pc.green("✔")} Repository:        ${pc.cyan(ctx.repoRoot ? ctx.repoRoot.split("/").pop() || "repo" : "unknown")}`);
    if (ctx.detectedRemoteProvider) {
      console.log(`     ${pc.green("✔")} Remote Provider:   ${pc.cyan(ctx.detectedRemoteProvider.name)} (${ctx.detectedRemoteProvider.host})`);
    }
    if (ctx.identity) {
      console.log(`     ${pc.green("✔")} Resolved Identity: ${pc.bold(ctx.identity.name)} <${pc.green(ctx.identity.email)}>`);
    }
    if (ctx.isMismatched) {
      console.log(`     ${pc.red("✖")} Consistency Check:  ${pc.red(`Local git email '${ctx.localGitEmail}' mismatches expected '${ctx.identity?.email}'`)}`);
    } else {
      console.log(`     ${pc.green("✔")} Consistency Check:  ${pc.green("Identity matches repository configuration")}`);
    }
  }

  console.log(pc.green("\n✔ Diagnostics complete.\n"));
}
