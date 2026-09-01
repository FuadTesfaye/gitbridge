import path from "node:path";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { renderRemotesTable } from "../ui/tables";
import { formatBadge } from "../ui/banners";
import pc from "picocolors";

export async function handleContextCommand(store: ConfigStore = defaultConfigStore) {
  const resolver = new IdentityResolver(store);
  const ctx = await resolver.resolve();

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

  if (ctx.isGitRepo && ctx.remotes.length > 0) {
    console.log("\n  " + pc.bold("Configured Remotes:"));
    console.log(renderRemotesTable(ctx.remotes));
  } else {
    console.log("");
  }
}
