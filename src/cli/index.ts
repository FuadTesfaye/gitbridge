import { Command } from "commander";
import { handleStatusCommand } from "./commands/status";
import { handleEnableCommand, handleDisableCommand } from "./commands/enable";
import { handleIdentityList, handleIdentityAdd, handleIdentityUse, handleIdentityRemove } from "./commands/identity";
import { handleAccountList, handleAccountRemove } from "./commands/account";
import { handleAuthLogin, handleAuthLogout } from "./commands/auth";
import { handleProviderList } from "./commands/provider";
import { handleRuleList, handleRuleAdd, handleRuleRemove } from "./commands/rule";
import { handleRepoInit } from "./commands/repo";
import { handleContextCommand } from "./commands/context";
import { handleRemoteList, handleRemoteAdd } from "./commands/remote";
import { handlePushCommand } from "./commands/push";
import { handleSwitchCommand } from "./commands/switch";
import { handleDoctorCommand } from "./commands/doctor";
import { handleSetupCommand } from "./commands/setup";
import { handleCredentialCommand } from "./commands/credential";
import { handleHookCommand } from "./commands/hook";
import {
  handleOverrideEnableCommand,
  handleOverrideDisableCommand,
  handleOverrideStatusCommand,
  handleGitProxyCommand,
} from "./commands/override";

export function createProgram(name = "gitbridge"): Command {
  const program = new Command();

  program
    .name(name)
    .description("Universal Git Identity & Multi-Account Management Layer")
    .version("0.1.0");

  // Onboarding Wizard
  program
    .command("setup")
    .description("Interactive onboarding wizard to configure identities, providers, and rules")
    .action(() => handleSetupCommand());

  // Status & Context
  program
    .command("status")
    .alias("st")
    .description("Show overall GitBridge status, active identities, accounts, and rules")
    .action(() => handleStatusCommand());

  program
    .command("context")
    .alias("ctx")
    .description("Display GitBridge and Git identity context for current directory or repo")
    .action(() => handleContextCommand());

  // Enable / Disable
  program
    .command("enable")
    .description("Enable GitBridge integration in ~/.gitconfig and ~/.ssh/config")
    .action(() => handleEnableCommand());

  program
    .command("disable")
    .description("Disable GitBridge integration and safely restore original Git config")
    .action(() => handleDisableCommand());

  // Native Git Command Override
  const overrideCmd = program
    .command("override")
    .description("Manage native Git command override to route standard 'git' through GitBridge");

  overrideCmd
    .command("enable")
    .description("Enable native Git command override across shells (Linux, macOS, Windows)")
    .action(() => handleOverrideEnableCommand());

  overrideCmd
    .command("disable")
    .description("Disable native Git command override and restore standard Git behavior")
    .action(() => handleOverrideDisableCommand());

  overrideCmd
    .command("status")
    .description("Check current status of native Git command override")
    .action(() => handleOverrideStatusCommand());

  overrideCmd.action(() => handleOverrideStatusCommand());

  // Switch Shortcut
  program
    .command("switch [identityId]")
    .alias("sw")
    .description("Quickly switch active Git identity (globally or for current repository)")
    .option("-g, --global", "Switch global default identity instead of local repo")
    .action((identityId, opts) => handleSwitchCommand(identityId, opts));

  // Init Repository Profile
  program
    .command("init")
    .description("Initialize GitBridge profile and identity for the current Git repository")
    .action(() => handleRepoInit());

  // Identity Subcommands
  const identityCmd = program
    .command("identity")
    .alias("id")
    .description("Manage Git commit identities (name, email, signing key)");
  
  identityCmd.command("list").alias("ls").description("List all configured identities").action(() => handleIdentityList());
  identityCmd
    .command("add")
    .description("Create a new Git identity")
    .option("--id <id>", "Identity ID (e.g. personal, work)")
    .option("--name <name>", "Full name for Git commits")
    .option("--email <email>", "Email address for Git commits")
    .option("--signing-key <key>", "SSH/GPG commit signing key")
    .option("--default", "Set as global default identity")
    .action((opts) => handleIdentityAdd(opts));
  identityCmd.command("use <id>").description("Set global default Git identity").action((id) => handleIdentityUse(id));
  identityCmd.command("remove <id>").alias("rm").description("Remove an identity").action((id) => handleIdentityRemove(id));

  // Account Subcommands
  const accountCmd = program
    .command("account")
    .alias("acc")
    .description("Manage authenticated provider accounts");
  
  accountCmd.command("list").alias("ls").description("List logged-in provider accounts").action(() => handleAccountList());
  accountCmd.command("remove <id>").alias("rm").description("Remove an account and erase credentials").action((id) => handleAccountRemove(id));

  // Auth Subcommands
  const authCmd = program.command("auth").description("Authenticate with Git providers");
  authCmd
    .command("login [provider]")
    .description("Log in to a Git provider (GitHub, GitLab, Bitbucket)")
    .option("-t, --token <token>", "Personal access token")
    .option("--host <host>", "Custom host for enterprise/self-hosted instances")
    .option("--ssh-key <path>", "Path to SSH private key to associate")
    .action((prov, opts) => handleAuthLogin(prov, opts));
  authCmd
    .command("logout <provider> [username]")
    .description("Log out of a provider and remove stored tokens")
    .action((prov, user) => handleAuthLogout(prov, user));

  // Provider Subcommands
  const providerCmd = program
    .command("provider")
    .alias("prov")
    .description("Inspect supported Git providers");
  
  providerCmd.command("list").alias("ls").description("List supported Git providers").action(() => handleProviderList());

  // Rule Subcommands
  const ruleCmd = program
    .command("rule")
    .alias("rules")
    .description("Manage directory routing rules");
  
  ruleCmd.command("list").alias("ls").description("List directory routing rules").action(() => handleRuleList());
  ruleCmd
    .command("add [path] [identityId]")
    .description("Add a directory routing rule (maps a folder to an identity)")
    .option("--id <id>", "Custom rule ID")
    .option("--provider <provider>", "Default provider for this directory")
    .option("--account <accountId>", "Default account for this directory")
    .action((p, id, opts) => handleRuleAdd(p, id, opts));
  ruleCmd.command("remove <idOrPath>").alias("rm").description("Remove a directory routing rule").action((target) => handleRuleRemove(target));

  // Remote Subcommands
  const remoteCmd = program
    .command("remote")
    .alias("rem")
    .description("Manage repository remotes across providers");
  
  remoteCmd.command("list").alias("ls").description("List remotes for current repository").action(() => handleRemoteList());
  remoteCmd
    .command("add <name> <url>")
    .description("Add a remote with optional provider account routing")
    .option("-a, --account <accountId>", "Account ID to route SSH alias to")
    .action((name, url, opts) => handleRemoteAdd(name, url, opts));

  // Push Multi-Remote Runner
  program
    .command("push [remoteOrProvider]")
    .description("Push current branch to configured remotes or multiple providers")
    .option("--all", "Push to all configured remotes simultaneously")
    .option("--tags", "Push tags as well")
    .option("-f, --force", "Force push")
    .action((target, opts) => handlePushCommand(target, opts));

  // Doctor Diagnostics
  program
    .command("doctor")
    .alias("doc")
    .description("Run comprehensive health and diagnostic checks")
    .action(() => handleDoctorCommand());

  // Credential Helper (Invoked by Git CLI)
  const credCmd = program.command("credential").description("Git credential helper bridge (invoked by git)");
  credCmd.command("get").description("Retrieve credentials for git").action(() => handleCredentialCommand("get"));
  credCmd.command("store").description("Store credentials for git").action(() => handleCredentialCommand("store"));
  credCmd.command("erase").description("Erase credentials for git").action(() => handleCredentialCommand("erase"));

  // Hook Subcommand (Invoked by Git hooks)
  const hookCmd = program.command("hook").description("Internal Git hook runner");
  hookCmd.command("pre-commit").description("Pre-commit identity validation").action(() => handleHookCommand("pre-commit"));

  // Internal Git Proxy Runner (Invoked by ~/.gitbridge/shims/git)
  program
    .command("git-proxy [args...]", { hidden: true })
    .allowUnknownOption(true)
    .description("Internal GitBridge proxy runner for intercepted git commands")
    .action((args) => {
      const proxyArgs = Array.isArray(args) ? args : [];
      return handleGitProxyCommand(proxyArgs);
    });

  return program;
}
