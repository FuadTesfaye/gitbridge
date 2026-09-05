import { Command } from "commander";
import { handleStatusCommand } from "./commands/status";
import { handleEnableCommand, handleDisableCommand } from "./commands/enable";
import { handleIdentityList, handleIdentityAdd, handleIdentityUse, handleIdentityEdit, handleIdentityRemove } from "./commands/identity";
import { handleAccountList, handleAccountAdd, handleAccountUse, handleAccountRemove } from "./commands/account";
import { handleAuthLogin, handleAuthLogout } from "./commands/auth";
import {
  handleProviderList,
  handleProviderEnable,
  handleProviderDisable,
  handleProviderAdd,
} from "./commands/provider";
import { handleExplainCommand } from "./commands/explain";
import { handleEnvCommand } from "./commands/env";
import { handleCurrentCommand } from "./commands/current";
import { handleCloneCommand } from "./commands/clone";
import { handleSshList, handleSshGenerate, handleSshLink } from "./commands/ssh";
import { handleCompletionCommand } from "./commands/completion";
import { handleRuleList, handleRuleAdd, handleRuleRemove } from "./commands/rule";
import { handleRepoInit, handleRepoSet, handleRepoList, handleRepoUnset } from "./commands/repo";
import { handleContextCommand } from "./commands/context";
import { handleRemoteList, handleRemoteAdd } from "./commands/remote";
import { handlePushCommand } from "./commands/push";
import { handleSwitchCommand } from "./commands/switch";
import { handleDoctorCommand } from "./commands/doctor";
import { handleUpdateCommand } from "./commands/update";
import { handleSetupCommand } from "./commands/setup";
import { handleCredentialCommand } from "./commands/credential";
import { handleHookCommand } from "./commands/hook";
import { handleSecurityCheck, handleSecurityFix, handleSecurityScan } from "./commands/security";
import {
  handleOverrideEnableCommand,
  handleOverrideDisableCommand,
  handleOverrideStatusCommand,
  handleGitProxyCommand,
} from "./commands/override";
import {
  handleIdeSyncCommand,
  handleIdeUnsyncCommand,
  handleIdeStatusCommand,
} from "./commands/ide";
import { configureProgramHelp } from "./ui/help";
import { formatCommandError, formatOptionError, normalizeArgv, detectParentCommand, handleTooManyArguments } from "@/utils/similarity";
import { GITBRIDGE_VERSION } from "@/version";

export function createProgram(name = "gitbridge"): Command {
  const program = new Command();

  program
    .name(name)
    .description("Universal Git Identity & Multi-Account Management Layer")
    .version(GITBRIDGE_VERSION);

  program.showSuggestionAfterError(false);

  // Override parse and parseAsync to normalize -help to --help
  const originalParse = program.parse.bind(program);
  program.parse = ((argv?: readonly string[], parseOptions?: any) => {
    const args = argv || process.argv;
    return originalParse(normalizeArgv([...args]), parseOptions);
  }) as any;

  const originalParseAsync = program.parseAsync.bind(program);
  program.parseAsync = ((argv?: readonly string[], parseOptions?: any) => {
    const args = argv || process.argv;
    return originalParseAsync(normalizeArgv([...args]), parseOptions);
  }) as any;

  // Onboarding Wizard
  program
    .command("setup")
    .description("Interactive onboarding wizard to configure identities, providers, and rules")
    .option("-q, --quick", "Quick automatic setup using detected Git environment")
    .action((opts) => handleSetupCommand(opts));

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
    .option("--json", "Output machine-readable JSON")
    .action((opts) => handleContextCommand(opts));

  program
    .command("explain")
    .description("Explain why GitBridge selected the current identity and configuration")
    .action(() => handleExplainCommand());

  program
    .command("env")
    .description("Print shell environment exports for current repository")
    .action(() => handleEnvCommand());

  program
    .command("current")
    .alias("cur")
    .description("Print current Git author identity, email, or prompt badge")
    .option("-p, --prompt", "Output compact badge for shell prompt")
    .option("--email", "Output resolved email only")
    .option("--name", "Output resolved name only")
    .option("--account", "Output target account username only")
    .option("--provider", "Output detected provider only")
    .action((opts) => handleCurrentCommand(opts));

  program
    .command("clone <url> [destination]")
    .description("Smart clone with provider detection, account selection, and identity setup")
    .option("-i, --identity <id>", "Identity ID to assign")
    .option("-a, --account <account>", "Account ID to route clone through")
    .option("-e, --email <email>", "Author email to bind repository to")
    .option("--profile <profile>", "Identity profile to assign (alias for --identity)")
    .action((url, dest, opts) => handleCloneCommand(url, dest, opts));

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

  // IDE Integration Sync (VS Code, Cursor, Antigravity, JetBrains)
  const ideCmd = program
    .command("ide")
    .description("Synchronize IDE configurations (VS Code, Cursor, Antigravity, JetBrains) with GitBridge");

  ideCmd
    .command("sync")
    .description("Configure all detected IDEs to route Git operations through GitBridge")
    .action(() => handleIdeSyncCommand());

  ideCmd
    .command("unsync")
    .description("Restore default IDE Git configurations")
    .action(() => handleIdeUnsyncCommand());

  ideCmd
    .command("status")
    .description("Inspect synchronization status across detected IDEs")
    .action(() => handleIdeStatusCommand());

  ideCmd.action(() => handleIdeStatusCommand());

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

  // Repository Subcommands
  const repoCmd = program
    .command("repo")
    .description("Manage persistent repository bindings (pin a repo to an identity and provider)");

  repoCmd
    .command("set [path]")
    .description("Bind a repository permanently to an identity, email, and provider")
    .option("-i, --identity <identityId>", "Identity ID or profile name")
    .option("-e, --email <email>", "Commit email address")
    .option("-p, --provider <provider>", "Git provider (github, gitlab, bitbucket, etc.)")
    .option("-a, --account <accountId>", "Provider account ID")
    .action((pathArg, opts) => handleRepoSet(pathArg, opts));

  repoCmd.command("list").alias("ls").description("List all remembered repository bindings").action(() => handleRepoList());
  repoCmd.command("unset [path]").alias("rm").description("Unbind a repository's persistent profile").action((pathArg) => handleRepoUnset(pathArg));
  repoCmd.command("init").description("Initialize profile for current repo").action(() => handleRepoInit());

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
  identityCmd
    .command("edit [id]")
    .description("Edit an existing Git identity (name, email, signing key)")
    .option("--name <name>", "Full name for Git commits")
    .option("--email <email>", "Email address for Git commits")
    .option("--signing-key <key>", "SSH/GPG commit signing key")
    .option("--default", "Set as global default identity")
    .action((id, opts) => handleIdentityEdit(id, opts));
  identityCmd.command("remove <id>").alias("rm").description("Remove an identity").action((id) => handleIdentityRemove(id));

  // Account Subcommands
  const accountCmd = program
    .command("account")
    .alias("acc")
    .description("Manage authenticated provider accounts");
  
  accountCmd.command("list").alias("ls").description("List logged-in provider accounts").action(() => handleAccountList());
  accountCmd
    .command("add")
    .description("Add and authenticate a new Git provider account")
    .option("-p, --provider <provider>", "Git provider (github, gitlab, bitbucket)")
    .option("-t, --token <token>", "Personal Access Token")
    .option("-u, --username <user>", "Username / Email for basic/password auth")
    .option("-P, --password <pass>", "Password for basic/password auth")
    .option("--host <host>", "Custom host")
    .option("--ssh-key <path>", "SSH key path")
    .action((opts) => handleAccountAdd(opts));
  accountCmd
    .command("use <providerOrAccount> [accountId]")
    .description("Set default provider account")
    .action((providerOrAccount, accountId) => handleAccountUse(providerOrAccount, accountId));
  accountCmd.command("remove <id>").alias("rm").description("Remove an account and erase credentials").action((id) => handleAccountRemove(id));

  // Auth Subcommands
  const authCmd = program.command("auth").description("Authenticate with Git providers");
  authCmd
    .command("login [provider]")
    .description("Log in to a Git provider (GitHub, GitLab, Bitbucket)")
    .option("-t, --token <token>", "Personal access token")
    .option("-u, --username <username>", "Username / email for credentials login")
    .option("-p, --password <password>", "Password for credentials login")
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
    .description("Inspect and manage supported Git providers");
  
  providerCmd.command("list").alias("ls").description("List supported Git providers and active state").action(() => handleProviderList());
  providerCmd.command("enable <id>").description("Enable a provider for detection and management").action((id) => handleProviderEnable(id));
  providerCmd.command("disable <id>").description("Disable a provider").action((id) => handleProviderDisable(id));
  providerCmd.command("add").description("Interactively select and enable a provider").action(() => handleProviderAdd());

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

  // SSH Subcommands
  const sshCmd = program
    .command("ssh")
    .description("Inspect and manage SSH keys and account routing");
  
  sshCmd.command("list").alias("ls").description("List discovered SSH keys and linked accounts").action(() => handleSshList());
  sshCmd
    .command("generate")
    .alias("gen")
    .description("Generate a new ed25519 SSH key and optionally link to an account")
    .option("-n, --name <name>", "Key filename in ~/.ssh")
    .option("-e, --email <email>", "Comment/email for key")
    .action((opts) => handleSshGenerate(opts));
  sshCmd
    .command("link [keyPath] [accountId]")
    .description("Link an existing SSH key to a provider account")
    .action((k, a) => handleSshLink(k, a));

  // Shell Completion Generator
  program
    .command("completion [shell]")
    .description("Generate shell autocompletion script (bash, zsh, fish)")
    .action((sh) => handleCompletionCommand(sh));

  // Self-Update Command
  program
    .command("update")
    .alias("upgrade")
    .description("Check for and install the latest version of GitBridge from npm")
    .option("-c, --check", "Check for available updates without installing")
    .option("-f, --force", "Force reinstallation of the latest version")
    .option("--registry <url>", "Custom npm registry URL")
    .action((opts) => handleUpdateCommand(opts));

  // Credential Helper (Invoked by Git CLI)
  const credCmd = program.command("credential").description("Git credential helper bridge (invoked by git)");
  credCmd.command("get").description("Retrieve credentials for git").action(() => handleCredentialCommand("get"));
  credCmd.command("store").description("Store credentials for git").action(() => handleCredentialCommand("store"));
  credCmd.command("erase").description("Erase credentials for git").action(() => handleCredentialCommand("erase"));

  // Security Subcommands
  const secCmd = program
    .command("security")
    .alias("sec")
    .description("Security health audit, permission hardening, and secret scanning")
    .action(() => handleSecurityCheck());
  
  secCmd.command("check").description("Run full security audit (permissions, remotes, keyring, staged secrets)").action(() => handleSecurityCheck());
  secCmd.command("fix").description("Auto-lock permissions to 0700/0600, scrub remote credentials, and install safety hooks").action(() => handleSecurityFix());
  secCmd.command("scan [path]").description("Scan a directory tree for private keys, API tokens, and sensitive files").action((p) => handleSecurityScan(p));

  // Hook Subcommand (Invoked by Git hooks)
  const hookCmd = program.command("hook").description("Internal Git hook runner");
  hookCmd.command("pre-commit").description("Pre-commit identity & secret validation").action(() => handleHookCommand("pre-commit"));
  hookCmd.command("pre-push").description("Pre-push identity & remote credential validation").action(() => handleHookCommand("pre-push"));

  // Internal Git Proxy Runner (Invoked by ~/.gitbridge/shims/git)
  program
    .command("git-proxy [args...]", { hidden: true })
    .allowUnknownOption(true)
    .description("Internal GitBridge proxy runner for intercepted git commands")
    .action((args) => {
      const proxyArgs = Array.isArray(args) ? args : [];
      return handleGitProxyCommand(proxyArgs);
    });

  // Disable Commander's built-in naive suggestions recursively on all commands
  const disableSuggestionsRecursively = (cmd: Command) => {
    cmd.showSuggestionAfterError(false);
    for (const sub of cmd.commands) {
      disableSuggestionsRecursively(sub);
    }
  };
  disableSuggestionsRecursively(program);

  // Configure outputError to format errors with intelligent suggestions
  program.configureOutput({
    outputError: (str, write) => {
      const tooManyMatch = handleTooManyArguments(str, process.argv, name);
      if (tooManyMatch) {
        write(tooManyMatch + "\n");
        return;
      }

      const unknownCmdMatch = str.match(/error: unknown command '([^']+)'/);
      if (unknownCmdMatch) {
        const unknownCmd = unknownCmdMatch[1];
        const parentCmd = detectParentCommand(process.argv, unknownCmd);
        write(formatCommandError(unknownCmd, name, parentCmd) + "\n");
        return;
      }

      const unknownOptMatch = str.match(/error: unknown option '([^']+)'/);
      if (unknownOptMatch) {
        const opt = unknownOptMatch[1];
        if (opt === "-help") {
          program.outputHelp();
          return;
        }
        const parentCmd = detectParentCommand(process.argv, opt);
        write(formatOptionError(opt, name, parentCmd) + "\n");
        return;
      }

      write(str);
    },
  });

  configureProgramHelp(program, name);

  return program;
}
