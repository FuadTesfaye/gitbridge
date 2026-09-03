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

  console.log(pc.bold("\n  GITBRIDGE CONTEXT"));
  console.log("  ──────────────────────────────────────────────────");

  if (ctx.isGitRepo) {
    const repoName = ctx.repoRoot ? path.basename(ctx.repoRoot) : "unknown";
    console.log(`  Repository:             ${pc.cyan(repoName)} (${ctx.repoRoot})`);
  } else {
    console.log(`  Directory:              ${pc.blue(ctx.cwd)} ${pc.gray("(not a git repo)")}`);
  }

  console.log(`  Resolution Source:      ${formatBadge(ctx.source.toUpperCase(), "cyan")}`);

  if (ctx.identity) {
    console.log(`  Resolved Identity:      ${pc.green(ctx.identity.name)} <${pc.green(ctx.identity.email)}>`);
    if (ctx.identity.signingKey) {
      console.log(`  Signing Key:            ${pc.yellow(ctx.identity.signingKey)}`);
    }
  } else {
    console.log(`  Resolved Identity:      ${pc.yellow("None configured")}`);
  }

  if (ctx.isGitRepo) {
    console.log(`  Local Git Email:        ${ctx.localGitEmail ? pc.cyan(ctx.localGitEmail) : pc.gray("not set in .git/config")}`);
    if (ctx.isMismatched) {
      console.log(
        pc.red(`  ⚠ WARNING:              Local git email '${ctx.localGitEmail}' does not match resolved identity '${ctx.identity?.email}'!`)
      );
    }
  }

  if (ctx.account) {
    console.log(`  Target Account:         ${pc.magenta(ctx.account.providerId.toUpperCase())} (${ctx.account.username})`);
    if (ctx.account.sshKeyPath) {
      console.log(`  SSH Key:                ${pc.yellow(ctx.account.sshKeyPath)}`);
    }
  }

  if (ctx.matchedRule) {
    console.log(`  Matched Rule:           ${pc.blue(ctx.matchedRule.id)} (${ctx.matchedRule.path})`);
  }

  if (ctx.detectedRemoteProvider && !ctx.detectedRemoteProvider.isConfigured) {
    console.log(
      pc.yellow(`\n  💡 Lazy Discovery: This repository uses ${pc.bold(ctx.detectedRemoteProvider.name)} (${ctx.detectedRemoteProvider.host}), which is not yet configured in GitBridge.`)
    );
    console.log(pc.gray(`     Run 'gb auth login ${ctx.detectedRemoteProvider.id}' to connect this provider account.`));
  }

  if (ctx.isGitRepo && ctx.remotes.length > 0) {
    console.log("\n  " + pc.bold("Configured Remotes:"));
    console.log(renderRemotesTable(ctx.remotes));
  } else {
    console.log("");
  }
}
