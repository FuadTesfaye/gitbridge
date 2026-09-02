import pc from "picocolors";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitOverrideManager } from "@/core/git/override-manager";
import { GitProxy } from "@/core/git/git-proxy";
import { logger } from "@/utils/logger";
import { formatBadge } from "../ui/banners";

export async function handleOverrideEnableCommand(store: ConfigStore = defaultConfigStore) {
  const manager = new GitOverrideManager(store);
  const result = manager.enable();

  logger.success("GitBridge Git Override enabled successfully!");

  console.log(pc.bold("\n  NATIVE GIT OVERRIDE ACTIVATED"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(`  Shims Location:       ${pc.cyan(result.shimsDir)}`);
  console.log(`  Real Git Executable:  ${pc.cyan(result.realGitPath || "Auto-detected")}`);
  
  if (result.modifiedFiles.length > 0) {
    console.log(`  Configured Shells:`);
    for (const file of result.modifiedFiles) {
      console.log(`    ${pc.green("✔")} ${pc.gray(file)}`);
    }
  }

  console.log(pc.green("\n✔ Git is now integrated with GitBridge!"));
  console.log(pc.gray("  • Native 'git' commands (commit, merge, push) will automatically apply GitBridge identities & rules."));
  console.log(pc.gray("  • You can also use 'git bridge <subcommand>' or 'git gb <subcommand>' directly."));
  console.log(pc.yellow("\n💡 Tip: To activate in your current terminal session, run:"));
  
  const isZsh = process.env.SHELL?.includes("zsh");
  const isFish = process.env.SHELL?.includes("fish");
  if (isFish) {
    console.log(pc.cyan("   source ~/.config/fish/config.fish\n"));
  } else if (isZsh) {
    console.log(pc.cyan("   source ~/.zshrc\n"));
  } else {
    console.log(pc.cyan("   source ~/.bashrc\n"));
  }
}

export async function handleOverrideDisableCommand(store: ConfigStore = defaultConfigStore) {
  const manager = new GitOverrideManager(store);
  const result = manager.disable();

  logger.success("GitBridge Git Override disabled successfully!");

  console.log(pc.bold("\n  NATIVE GIT OVERRIDE DEACTIVATED"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(pc.yellow("⚠ GitBridge shims removed and shell profiles restored."));
  
  if (result.modifiedFiles.length > 0) {
    console.log(`  Cleaned Shell Profiles:`);
    for (const file of result.modifiedFiles) {
      console.log(`    ${pc.green("✔")} ${pc.gray(file)}`);
    }
  }

  console.log(pc.gray("\n  • Standard Git commands will now run directly without GitBridge proxying."));
  console.log(pc.gray("  • Run 'gitbridge override enable' anytime to re-enable.\n"));
}

export async function handleOverrideStatusCommand(store: ConfigStore = defaultConfigStore) {
  const manager = new GitOverrideManager(store);
  const status = manager.getOverrideStatus();

  console.log(pc.bold("\n  NATIVE GIT OVERRIDE STATUS"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(`  Override Mode:        ${status.enabled ? formatBadge("ENABLED", "green") : formatBadge("DISABLED", "red")}`);
  console.log(`  Shims Installed:      ${status.shimsInstalled ? pc.green("✔ Installed") : pc.yellow("⚠ Missing (run 'gitbridge override enable')")}`);
  console.log(`  Shims Directory:      ${pc.cyan(status.shimsDir)}`);
  console.log(`  Real Git Executable:  ${pc.cyan(status.realGitPath || "Not discovered")}`);
  console.log(`  Active in Session:    ${status.isInCurrentPath ? pc.green("✔ In current PATH") : pc.yellow("○ Not yet in PATH (restart shell or source profile)")}`);

  if (status.modifiedShellFiles.length > 0) {
    console.log(pc.bold("\n  Shell Configurations Injected:"));
    for (const file of status.modifiedShellFiles) {
      console.log(`    ${pc.green("✔")} ${pc.gray(file)}`);
    }
  } else {
    console.log(pc.gray("\n  No shell profiles currently contain the GitBridge override block."));
  }

  console.log("");
}

export async function handleGitProxyCommand(args: string[], store: ConfigStore = defaultConfigStore): Promise<void> {
  const proxy = new GitProxy(store);
  const exitCode = await proxy.execute(args);
  process.exit(exitCode);
}
