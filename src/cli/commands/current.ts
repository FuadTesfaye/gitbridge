import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import pc from "picocolors";

export interface CurrentCommandOptions {
  prompt?: boolean;
  email?: boolean;
  name?: boolean;
  account?: boolean;
  provider?: boolean;
}

export async function handleCurrentCommand(
  options: CurrentCommandOptions = {},
  store: ConfigStore = defaultConfigStore
) {
  const resolver = new IdentityResolver(store);
  const ctx = await resolver.resolve();

  if (options.email) {
    console.log(ctx.identity?.email || ctx.localGitEmail || "");
    return;
  }

  if (options.name) {
    console.log(ctx.identity?.name || ctx.localGitName || "");
    return;
  }

  if (options.account) {
    console.log(ctx.account?.username || "");
    return;
  }

  if (options.provider) {
    console.log(ctx.detectedRemoteProvider?.name || ctx.account?.providerId || "");
    return;
  }

  if (options.prompt) {
    const parts: string[] = [];
    if (ctx.account) {
      parts.push(`[${ctx.account.providerId}:${ctx.account.username}]`);
    } else if (ctx.detectedRemoteProvider) {
      parts.push(`[${ctx.detectedRemoteProvider.name}]`);
    }

    if (ctx.identity) {
      parts.push(`[${ctx.identity.id}]`);
    }

    console.log(parts.join(" "));
    return;
  }

  // Default human-readable short output
  if (ctx.identity) {
    const idBadge = pc.cyan(`(${ctx.identity.id})`);
    console.log(`${pc.bold(ctx.identity.name)} <${pc.green(ctx.identity.email)}> ${idBadge}`);
  } else if (ctx.localGitEmail) {
    console.log(`${ctx.localGitName || "Git User"} <${ctx.localGitEmail}> ${pc.gray("(git-fallback)")}`);
  } else {
    console.log(pc.yellow("No Git identity configured."));
  }
}
