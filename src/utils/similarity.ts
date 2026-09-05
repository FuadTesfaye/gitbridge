import pc from "picocolors";

export interface CommandEntry {
  name: string;
  alias?: string;
  desc: string;
  parent?: string;
  subcommands?: CommandEntry[];
}

export interface Suggestion {
  command: string;
  fullCommand: string;
  alias?: string;
  desc: string;
  score: number;
  isSubcommandOfParent?: boolean;
}

/**
 * Calculates the Damerau-Levenshtein distance between two strings.
 * Handles insertions, deletions, substitutions, and adjacent transpositions.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const d: number[][] = Array.from({ length: al + 1 }, () => Array(bl + 1).fill(0));

  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[al][bl];
}

/**
 * Calculates a normalized similarity score (0.0 to 1.0) with prefix boosting.
 */
export function scoreSimilarity(input: string, candidate: string): number {
  const i = input.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();

  if (i === c) return 1.0;
  if (i.length === 0 || c.length === 0) return 0.0;

  // Prefix boosting: if candidate starts with input, e.g. "ident" in "identity"
  if (c.startsWith(i)) {
    return 0.90 + (i.length / c.length) * 0.09;
  }

  // If input starts with candidate (e.g. "identity-extra" -> "identity")
  if (i.startsWith(c)) {
    return 0.85;
  }

  // If candidate includes input as a substring
  if (c.includes(i)) {
    return 0.75;
  }

  const dist = damerauLevenshtein(i, c);
  const maxLen = Math.max(i.length, c.length);
  const rawScore = 1 - dist / maxLen;

  return Math.max(0, rawScore);
}

/**
 * Registry of all GitBridge commands and subcommands.
 */
export const COMMAND_REGISTRY: CommandEntry[] = [
  // Core Workflows
  { name: "setup", desc: "Interactive onboarding wizard to configure identities, providers, and rules" },
  { name: "status", alias: "st", desc: "Show overall GitBridge status, active identities, accounts, and rules" },
  { name: "context", alias: "ctx", desc: "Inspect Git and GitBridge identity context for current repo" },
  { name: "explain", desc: "Explain why GitBridge selected the current identity & configuration" },
  { name: "current", alias: "cur", desc: "Print current Git author identity, email, or shell prompt badge" },
  { name: "switch", alias: "sw", desc: "Quickly switch active Git identity (locally or --global)" },
  { name: "clone", desc: "Smart clone with provider detection, account routing, and identity setup" },
  { name: "init", desc: "Initialize a GitBridge profile for current Git repository" },
  { name: "env", desc: "Print shell environment exports for current repository" },

  // Identity & Repositories
  {
    name: "identity",
    alias: "id",
    desc: "Manage Git commit identities (list, add, use, edit, remove)",
    subcommands: [
      { name: "list", alias: "ls", desc: "List all configured identities" },
      { name: "add", desc: "Create a new Git identity" },
      { name: "use", desc: "Set global default Git identity" },
      { name: "edit", desc: "Edit an existing Git identity" },
      { name: "remove", alias: "rm", desc: "Remove an identity" },
    ],
  },
  {
    name: "repo",
    desc: "Manage persistent repository bindings (set, list, unset, init)",
    subcommands: [
      { name: "set", desc: "Bind a repository permanently to an identity, email, and provider" },
      { name: "list", alias: "ls", desc: "List all remembered repository bindings" },
      { name: "unset", alias: "rm", desc: "Unbind a repository's persistent profile" },
      { name: "init", desc: "Initialize profile for current repo" },
    ],
  },
  {
    name: "rule",
    alias: "rules",
    desc: "Manage directory routing rules (list, add, remove)",
    subcommands: [
      { name: "list", alias: "ls", desc: "List directory routing rules" },
      { name: "add", desc: "Add a directory routing rule (maps a folder to an identity)" },
      { name: "remove", alias: "rm", desc: "Remove a directory routing rule" },
    ],
  },
  {
    name: "ssh",
    desc: "Inspect and manage SSH keys and account routing (list, generate, link)",
    subcommands: [
      { name: "list", alias: "ls", desc: "List discovered SSH keys and linked accounts" },
      { name: "generate", alias: "gen", desc: "Generate a new ed25519 SSH key and optionally link to an account" },
      { name: "link", desc: "Link an existing SSH key to a provider account" },
    ],
  },

  // Providers, Accounts & Multi-Remote
  {
    name: "auth",
    desc: "Authenticate with Git providers (login, logout)",
    subcommands: [
      { name: "login", desc: "Log in to a Git provider (GitHub, GitLab, Bitbucket)" },
      { name: "logout", desc: "Log out of a provider and remove stored tokens" },
    ],
  },
  {
    name: "account",
    alias: "acc",
    desc: "Manage authenticated provider accounts (list, add, use, remove)",
    subcommands: [
      { name: "list", alias: "ls", desc: "List logged-in provider accounts" },
      { name: "add", desc: "Add and authenticate a new Git provider account" },
      { name: "use", desc: "Set default provider account" },
      { name: "remove", alias: "rm", desc: "Remove an account and erase credentials" },
    ],
  },
  {
    name: "provider",
    alias: "prov",
    desc: "Inspect and manage supported Git providers (GitHub, GitLab, Bitbucket)",
    subcommands: [
      { name: "list", alias: "ls", desc: "List supported Git providers and active state" },
      { name: "enable", desc: "Enable a provider for detection and management" },
      { name: "disable", desc: "Disable a provider" },
      { name: "add", desc: "Interactively select and enable a provider" },
    ],
  },
  {
    name: "remote",
    alias: "rem",
    desc: "Manage repository remotes across providers (list, add)",
    subcommands: [
      { name: "list", alias: "ls", desc: "List remotes for current repository" },
      { name: "add", desc: "Add a remote with optional provider account routing" },
    ],
  },
  { name: "push", desc: "Push current branch to configured remotes or multiple providers" },

  // Integrations & System Overrides
  {
    name: "override",
    desc: "Route native 'git' commands through GitBridge (enable, disable, status)",
    subcommands: [
      { name: "enable", desc: "Enable native Git command override across shells" },
      { name: "disable", desc: "Disable native Git command override and restore standard Git behavior" },
      { name: "status", desc: "Check current status of native Git command override" },
    ],
  },
  {
    name: "ide",
    desc: "Synchronize IDE configurations (VS Code, Cursor, Antigravity, JetBrains)",
    subcommands: [
      { name: "sync", desc: "Configure all detected IDEs to route Git operations through GitBridge" },
      { name: "unsync", desc: "Restore default IDE Git configurations" },
      { name: "status", desc: "Inspect synchronization status across detected IDEs" },
    ],
  },
  { name: "enable", desc: "Enable GitBridge integration in ~/.gitconfig and ~/.ssh/config" },
  { name: "disable", desc: "Disable GitBridge integration and safely restore original Git config" },
  { name: "update", alias: "upgrade", desc: "Check for and install the latest version of GitBridge from npm" },
  { name: "completion", desc: "Generate shell autocompletion script (bash, zsh, fish)" },

  // Security & Diagnostics
  {
    name: "security",
    alias: "sec",
    desc: "Security audit, permission hardening, and secret scanning (check, fix, scan)",
    subcommands: [
      { name: "check", desc: "Run full security audit (permissions, remotes, keyring, staged secrets)" },
      { name: "fix", desc: "Auto-lock permissions to 0700/0600, scrub remote credentials, and install safety hooks" },
      { name: "scan", desc: "Scan a directory tree for private keys, API tokens, and sensitive files" },
    ],
  },
  { name: "doctor", alias: "doc", desc: "Run comprehensive system health and diagnostic checks" },
];

/**
 * Finds the closest command suggestions for a given input.
 * If parentCommand is provided, searches within that command's subcommands.
 * If at root level, also detects if the input was meant as a subcommand of another command.
 */
export function findCommandSuggestions(
  input: string,
  parentCommandName?: string,
  threshold = 0.45
): Suggestion[] {
  const normalized = input.toLowerCase().trim();
  const suggestions: Suggestion[] = [];

  // If a parent command is specified, search its subcommands
  if (parentCommandName) {
    const parent = COMMAND_REGISTRY.find(
      (c) => c.name.toLowerCase() === parentCommandName.toLowerCase() || (c.alias && c.alias.toLowerCase() === parentCommandName.toLowerCase())
    );

    if (parent && parent.subcommands) {
      for (const sub of parent.subcommands) {
        let bestScore = scoreSimilarity(normalized, sub.name);
        if (sub.alias) {
          const aliasScore = scoreSimilarity(normalized, sub.alias);
          if (aliasScore > bestScore) bestScore = aliasScore;
        }

        if (bestScore >= threshold) {
          suggestions.push({
            command: sub.name,
            fullCommand: `${parent.name} ${sub.name}`,
            alias: sub.alias,
            desc: sub.desc,
            score: bestScore,
          });
        }
      }

      return suggestions.sort((a, b) => b.score - a.score);
    }
  }

  // Root level matching:
  // 1. Check root commands and their aliases
  for (const cmd of COMMAND_REGISTRY) {
    let bestScore = scoreSimilarity(normalized, cmd.name);
    if (cmd.alias) {
      const aliasScore = scoreSimilarity(normalized, cmd.alias);
      if (aliasScore > bestScore) bestScore = aliasScore;
    }

    if (bestScore >= threshold) {
      suggestions.push({
        command: cmd.name,
        fullCommand: cmd.name,
        alias: cmd.alias,
        desc: cmd.desc,
        score: bestScore,
      });
    }
  }

  // 2. Check if user typed a known subcommand at the root level (e.g. `login`, `check`, `scan`, `gen`, `sync`)
  for (const parent of COMMAND_REGISTRY) {
    if (!parent.subcommands) continue;

    for (const sub of parent.subcommands) {
      let subScore = scoreSimilarity(normalized, sub.name);
      if (sub.alias) {
        const aliasScore = scoreSimilarity(normalized, sub.alias);
        if (aliasScore > subScore) subScore = aliasScore;
      }

      // If exact or very close match to a subcommand
      if (subScore >= 0.70) {
        suggestions.push({
          command: sub.name,
          fullCommand: `${parent.name} ${sub.name}`,
          alias: sub.alias,
          desc: sub.desc,
          score: subScore * 0.98, // slight tie-breaker favor for direct root commands
          isSubcommandOfParent: true,
        });
      }
    }
  }

  // Sort descending by score
  return suggestions.sort((a, b) => b.score - a.score);
}

/**
 * Formats a clean, helpful error message with intelligent suggestions for CLI output.
 */
export function formatCommandError(
  input: string,
  programName: string = "gb",
  parentCommandName?: string
): string {
  const suggestions = findCommandSuggestions(input, parentCommandName);
  const lines: string[] = [];

  if (parentCommandName) {
    lines.push(pc.red(`✖️  Unknown subcommand for '${programName} ${parentCommandName}': `) + pc.yellow(`'${input}'`));
  } else {
    lines.push(pc.red(`✖️  Unknown command: `) + pc.yellow(`'${input}'`));
  }

  lines.push("");

  if (suggestions.length > 0) {
    const top = suggestions[0];

    if (suggestions.length === 1 || top.score >= 0.85) {
      lines.push(pc.bold(pc.yellow("Did you mean:")));
      let cmdStr: string;
      if (parentCommandName) {
        cmdStr = `${programName} ${parentCommandName} ${top.command}`;
        if (top.alias) {
          cmdStr += ` ${pc.gray(`(or '${programName} ${parentCommandName} ${top.alias}')`)}`;
        }
      } else {
        cmdStr = `${programName} ${top.fullCommand}`;
        if (top.alias) {
          cmdStr += ` ${pc.gray(`(or '${programName} ${top.fullCommand.includes(" ") ? top.fullCommand.split(" ")[0] + " " + top.alias : top.alias}')`)}`;
        }
      }
      lines.push(`  ${pc.cyan(cmdStr)}`);
      lines.push(`  ${pc.gray(top.desc)}`);
    } else {
      lines.push(pc.bold(pc.yellow("Did you mean one of these?")));
      const candidates = suggestions.slice(0, 4);
      for (const s of candidates) {
        const full = parentCommandName ? `${programName} ${parentCommandName} ${s.command}` : `${programName} ${s.fullCommand}`;
        const spaces = " ".repeat(Math.max(2, 28 - full.length));
        lines.push(`  ${pc.cyan(full)}${spaces}${pc.gray(s.desc)}`);
      }
    }
  } else {
    lines.push(pc.gray(`No similar commands found.`));
  }

  lines.push("");
  if (parentCommandName) {
    lines.push(pc.gray(`Run `) + pc.cyan(`${programName} ${parentCommandName} --help`) + pc.gray(` to see all available subcommands.`));
  } else {
    lines.push(pc.gray(`Run `) + pc.cyan(`${programName} --help`) + pc.gray(` to see all available commands.`));
  }

  return lines.join("\n");
}

/**
 * Detects the parent command from CLI arguments if an unknown subcommand was provided.
 */
export function detectParentCommand(argv: string[], unknownCmd: string): string | undefined {
  const idx = argv.lastIndexOf(unknownCmd);
  if (idx > 0) {
    for (let i = idx - 1; i >= 0; i--) {
      const arg = argv[i];
      if (arg.startsWith("-")) continue;
      const lower = arg.toLowerCase();
      if (
        lower.endsWith(".ts") ||
        lower.endsWith(".js") ||
        lower === "bun" ||
        lower === "node" ||
        lower === "gb" ||
        lower === "gitbridge" ||
        lower.endsWith("/gb") ||
        lower.endsWith("/gitbridge")
      ) {
        break;
      }
      return arg;
    }
  }
  return undefined;
}

/**
 * Handles Commander's "too many arguments" error when an unknown subcommand is passed
 * to a command that defines both a default action and subcommands.
 */
export function handleTooManyArguments(
  str: string,
  argv: string[],
  programName: string = "gb"
): string | null {
  const match = str.match(/error: too many arguments for '([^']+)'. Expected 0 arguments but got (\d+)/);
  if (!match) return null;

  const cmdName = match[1];
  const entry = COMMAND_REGISTRY.find(
    (c) => c.name.toLowerCase() === cmdName.toLowerCase() || (c.alias && c.alias.toLowerCase() === cmdName.toLowerCase())
  );
  if (!entry || !entry.subcommands) return null;

  let extraArg: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === entry.name || (entry.alias && arg === entry.alias)) {
      for (let j = i + 1; j < argv.length; j++) {
        if (!argv[j].startsWith("-")) {
          extraArg = argv[j];
          break;
        }
      }
      break;
    }
  }

  if (extraArg) {
    return formatCommandError(extraArg, programName, entry.name);
  }

  return null;
}

export const COMMON_OPTIONS = [
  "--version",
  "-V",
  "--help",
  "-h",
  "--quick",
  "-q",
  "--json",
  "--prompt",
  "-p",
  "--email",
  "-e",
  "--name",
  "-n",
  "--account",
  "-a",
  "--provider",
  "--global",
  "-g",
  "--token",
  "-t",
  "--username",
  "-u",
  "--password",
  "-P",
  "--host",
  "--ssh-key",
  "--signing-key",
  "--default",
  "--id",
  "--all",
  "--tags",
  "--force",
  "-f",
];

/**
 * Formats an unknown option error message with suggestions.
 */
export function formatOptionError(
  input: string,
  programName: string = "gb",
  parentCommandName?: string
): string {
  const normalized = input.toLowerCase().trim();
  const ranked = COMMON_OPTIONS.map((opt) => ({
    opt,
    score: scoreSimilarity(normalized, opt),
  }))
    .filter((o) => o.score >= 0.5)
    .sort((a, b) => b.score - a.score);

  const lines: string[] = [];
  lines.push(pc.red(`✖️  Unknown option: `) + pc.yellow(`'${input}'`));
  lines.push("");

  if (ranked.length > 0) {
    lines.push(pc.bold(pc.yellow("Did you mean:")));
    lines.push(`  ${pc.cyan(ranked[0].opt)}`);
  } else {
    lines.push(pc.gray(`No similar options found.`));
  }

  lines.push("");
  const target = parentCommandName ? `${programName} ${parentCommandName}` : programName;
  lines.push(pc.gray(`Run `) + pc.cyan(`${target} --help`) + pc.gray(` to see all available options.`));

  return lines.join("\n");
}

/**
 * Normalizes command line arguments so that `-help` is seamlessly mapped to `--help`.
 */
export function normalizeArgv(argv: string[]): string[] {
  return argv.map((arg) => (arg === "-help" ? "--help" : arg));
}
