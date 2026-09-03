import path from "node:path";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { renderRemotesTable } from "../ui/tables";
import { formatBadge } from "../ui/banners";
import pc from "picocolors";

export interface ContextCommandOptions {
  json?: boolean;
}

export async function handleContextCommand(options: ContextCommandOptions = {}, store: ConfigStore = defaultConfigStore) {
  const resolver = new IdentityResolver(store);
  const ctx = await resolver.resolve();

  if (options.json) {
    const jsonOutput = {
      repository: ctx.repoRoot ? path.basename(ctx.repoRoot) : null,
      repositoryPath: ctx.repoRoot,
      isGitRepo: ctx.isGitRepo,
      source: ctx.source,
      identity: ctx.identity
        ? {
            id: ctx.identity.id,
            name: ctx.identity.name,
            email: ctx.identity.email,
            signingKey: ctx.identity.signingKey,
          }
        : null,
      account: ctx.account
        ? {
            id: ctx.account.id,
            provider: ctx.account.providerId,
            username: ctx.account.username,
            host: ctx.account.host,
            sshKeyPath: ctx.account.sshKeyPath,
          }
        : null,
      provider: ctx.detectedRemoteProvider
        ? {
            id: ctx.detectedRemoteProvider.id,
            name: ctx.detectedRemoteProvider.name,
            host: ctx.detectedRemoteProvider.host,
            isEnabled: ctx.detectedRemoteProvider.isEnabled,
            isConfigured: ctx.detectedRemoteProvider.isConfigured,
          }
        : null,
      matchedRule: ctx.matchedRule ? { id: ctx.matchedRule.id, path: ctx.matchedRule.path } : null,
      localGitEmail: ctx.localGitEmail,
      localGitName: ctx.localGitName,
      isMismatched: ctx.isMismatched,
    };

    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  console.log(pc.bold("\n  GitBridge Context"));
  console.log("  ──────────────────────────────────────────────────");

  // 1. Repository
  if (ctx.isGitRepo) {
    const repoName = ctx.repoRoot ? path.basename(ctx.repoRoot) : "unknown";
    console.log(pc.bold("\n  Repository"));
    console.log(`    ${pc.cyan(repoName)} ${pc.gray(`(${ctx.repoRoot})`)}`);
  } else {
    console.log(pc.bold("\n  Directory"));
    console.log(`    ${pc.blue(ctx.cwd)} ${pc.gray("(not a git repository)")}`);
  }

  // 2. Remote
  if (ctx.isGitRepo && ctx.remotes.length > 0) {
    const primary = ctx.remotes[0];
    const remoteUrl = primary.fetchUrl || primary.pushUrl;
    console.log(pc.bold("\n  Remote"));
    console.log(`    ${pc.cyan(primary.name)} → ${pc.gray(remoteUrl)}`);
  }

  // 3. Provider
  if (ctx.detectedRemoteProvider) {
    console.log(pc.bold("\n  Provider"));
    console.log(`    ${pc.green(ctx.detectedRemoteProvider.name)} ${pc.gray(`(${ctx.detectedRemoteProvider.host})`)}`);
  } else if (ctx.account) {
    console.log(pc.bold("\n  Provider"));
    console.log(`    ${pc.green(ctx.account.providerId.toUpperCase())} ${pc.gray(`(${ctx.account.host})`)}`);
  }

  // 4. Account
  if (ctx.account) {
    console.log(pc.bold("\n  Account"));
    console.log(`    ${pc.magenta(ctx.account.id)} ${pc.gray(`(${ctx.account.username})`)}`);
  }

  // 5. Identity
  console.log(pc.bold("\n  Identity"));
  if (ctx.identity) {
    const defaultTag = ctx.identity.isDefault ? pc.gray(" [default]") : "";
    console.log(`    ${pc.bold(ctx.identity.name)} <${pc.green(ctx.identity.email)}> ${pc.cyan(`(${ctx.identity.id})`)}${defaultTag}`);
    if (ctx.identity.signingKey) {
      console.log(`    ${pc.gray("Signing Key:")} ${pc.yellow(ctx.identity.signingKey)}`);
    }
  } else {
    console.log(`    ${pc.yellow("No identity configured")}`);
  }

  // 6. SSH
  if (ctx.account?.sshKeyPath) {
    console.log(pc.bold("\n  SSH"));
    console.log(`    ${pc.yellow(ctx.account.sshKeyPath)}`);
  }

  // 7. Matched Rule & Resolution
  if (ctx.matchedRule) {
    console.log(pc.bold("\n  Matched Rule"));
    console.log(`    ${pc.blue(ctx.matchedRule.path)} ${pc.gray(`(${ctx.matchedRule.id})`)}`);
  }

  // 8. Status & Safety Check
  console.log(pc.bold("\n  Status"));
  if (ctx.isMismatched) {
    console.log(pc.red(`    ✖ Mismatched! Local git email '${ctx.localGitEmail}' does not match expected '${ctx.identity?.email}'`));
  } else if (ctx.identity) {
    console.log(`    ${pc.green("✔ Correct")} ${pc.gray(`(via ${ctx.source})`)}`);
  } else {
    console.log(`    ${pc.yellow("○ Unconfigured")}`);
  }

  if (ctx.detectedRemoteProvider && !ctx.detectedRemoteProvider.isConfigured) {
    console.log(
      pc.yellow(`\n  💡 Lazy Discovery: This repository uses ${pc.bold(ctx.detectedRemoteProvider.name)} (${ctx.detectedRemoteProvider.host}), which is not yet configured in GitBridge.`)
    );
    console.log(pc.gray(`     Run 'gb auth login ${ctx.detectedRemoteProvider.id}' to connect this provider account.`));
  }

  if (ctx.isGitRepo && ctx.remotes.length > 1) {
    console.log("\n  " + pc.bold("All Configured Remotes:"));
    console.log(renderRemotesTable(ctx.remotes));
  } else {
    console.log("");
  }
}
