import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { GitConfigInjector } from "@/core/git/gitconfig-injector";
import { SshInjector } from "@/core/ssh/ssh-injector";
import { logger } from "@/utils/logger";
import pc from "picocolors";

export async function handleEnableCommand(store: ConfigStore = defaultConfigStore) {
  store.setEnabled(true);

  const gitInjector = new GitConfigInjector(store);
  const sshInjector = new SshInjector(store);

  const gitRes = gitInjector.inject();
  const sshRes = sshInjector.inject();

  logger.success("GitBridge enabled successfully!");
  if (gitRes.backupPath) {
    logger.debug(`Created backup of .gitconfig at ${gitRes.backupPath}`);
  }
  if (sshRes.backupPath) {
    logger.debug(`Created backup of .ssh/config at ${sshRes.backupPath}`);
  }

  console.log(pc.green("\n✔ GitBridge integration is now active."));
  console.log(pc.gray("  • Native Git commands (commit, push, pull) will now inherit GitBridge context."));
  console.log(pc.gray("  • Run 'gitbridge status' or 'gitbridge context' to inspect current setup.\n"));
}

export async function handleDisableCommand(store: ConfigStore = defaultConfigStore) {
  store.setEnabled(false);

  const gitInjector = new GitConfigInjector(store);
  const sshInjector = new SshInjector(store);

  gitInjector.remove();
  sshInjector.remove();

  logger.success("GitBridge disabled successfully!");
  console.log(pc.yellow("\n⚠ GitBridge integration has been safely removed."));
  console.log(pc.gray("  • ~/.gitconfig and ~/.ssh/config have been restored to native settings."));
  console.log(pc.gray("  • Run 'gitbridge enable' to reactivate whenever you want.\n"));
}
