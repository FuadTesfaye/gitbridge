import path from "node:path";
import pc from "picocolors";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { expandTilde } from "@/utils/platform";

export async function handleExplainCommand(store: ConfigStore = defaultConfigStore) {
  const resolver = new IdentityResolver(store);
  const ctx = await resolver.resolve();
  const config = store.loadConfig();
  const rules = store.loadRules();

  console.log(pc.bold("\n  GITBRIDGE DECISION TREE (WHY?)"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(`  Directory:              ${pc.cyan(ctx.cwd)}`);
  if (ctx.isGitRepo) {
    console.log(`  Repository Root:        ${pc.cyan(ctx.repoRoot || "")}`);
  }

  console.log(pc.bold("\n  Resolution Hierarchy Analysis:"));

  // 1. Local Repo Check
  const localFile = ctx.repoRoot ? path.join(ctx.repoRoot, ".git", "gitbridge.json") : null;
  if (localFile && ctx.source === "repo_profile") {
    console.log(`    ${pc.green("✔")} Tier 1: Local Repository Override (.git/gitbridge.json)`);
    console.log(pc.gray(`      Applied directly from repository-level configuration file.`));
  } else {
    console.log(`    ${pc.gray("○")} Tier 1: Local Repository Config (.git/gitbridge.json)`);
    console.log(pc.gray(`      No local .git/gitbridge.json override found.`));
  }

  // 2. Repos.json Check
  if (ctx.repoProfile && ctx.source === "repo_profile") {
    console.log(`    ${pc.green("✔")} Tier 2: Repository Profile (repos.json)`);
    console.log(pc.gray(`      Explicit mapping in repos.json matched this repository path.`));
  } else {
    console.log(`    ${pc.gray("○")} Tier 2: Repository Profile (repos.json)`);
    console.log(pc.gray(`      No explicit repository entry in repos.json.`));
  }

  // 3. Directory Rules Check
  if (ctx.matchedRule) {
    console.log(`    ${pc.green("✔")} Tier 3: Directory Rule (${pc.bold(ctx.matchedRule.id)})`);
    console.log(`      Path pattern: ${pc.cyan(ctx.matchedRule.path)} (expanded: ${pc.gray(expandTilde(ctx.matchedRule.path))})`);
    console.log(pc.gray(`      Won via longest-prefix path match among ${rules.length} configured rule(s).`));
    console.log(pc.gray(`      Mapped to identity ID: '${ctx.matchedRule.identityId}'`));
  } else {
    console.log(`    ${pc.gray("○")} Tier 3: Directory Rules`);
    console.log(pc.gray(`      None of the ${rules.length} directory rules matched the current path prefix.`));
  }

  // 4. Remote Access Check
  if (ctx.source === "remote_access") {
    console.log(`    ${pc.green("✔")} Tier 4: Remote Repository Access Detection`);
    console.log(pc.gray(`      Matched authenticated account/identity for repository remote.`));
  } else {
    console.log(`    ${pc.gray("○")} Tier 4: Remote Repository Access Detection`);
    console.log(pc.gray(`      No matching authenticated account found for repository remotes.`));
  }

  // 5. Global Default Check
  if (ctx.source === "global_default") {
    console.log(`    ${pc.green("✔")} Tier 5: Global Default Identity`);
    console.log(pc.gray(`      Fell back to designated default identity ID: '${config.defaultIdentityId}'`));
  } else if (config.defaultIdentityId) {
    console.log(`    ${pc.gray("○")} Tier 5: Global Default Identity (${config.defaultIdentityId})`);
    console.log(pc.gray(`      Skipped because a higher-priority rule already matched.`));
  }

  // 6. System Fallback
  if (ctx.source === "system_fallback") {
    console.log(`    ${pc.green("✔")} Tier 6: System Git Fallback`);
    console.log(pc.gray(`      Used existing user.name and user.email from ~/.gitconfig.`));
  }

  console.log(pc.bold("\n  Final Resolved Outcomes:"));
  if (ctx.identity) {
    console.log(`    • Identity:          ${pc.green(ctx.identity.name)} <${pc.green(ctx.identity.email)}>`);
  } else {
    console.log(`    • Identity:          ${pc.yellow("None configured")}`);
  }

  if (ctx.account) {
    console.log(`    • Provider Account:  ${pc.magenta(ctx.account.providerId.toUpperCase())} (${ctx.account.username})`);
    if (ctx.account.sshKeyPath) {
      console.log(`    • SSH Key:           ${pc.yellow(ctx.account.sshKeyPath)}`);
    }
  }

  if (ctx.detectedRemoteProvider) {
    const statusText = ctx.detectedRemoteProvider.isConfigured
      ? pc.green("Configured")
      : ctx.detectedRemoteProvider.isEnabled
      ? pc.cyan("Enabled (no accounts)")
      : pc.gray("Available (not enabled)");
    console.log(`    • Remote Provider:   ${ctx.detectedRemoteProvider.name} (${ctx.detectedRemoteProvider.host}) - ${statusText}`);
  }

  console.log("");
}
