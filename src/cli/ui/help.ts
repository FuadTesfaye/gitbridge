import pc from "picocolors";
import { Command } from "commander";

interface HelpRow {
  name: string;
  alias?: string;
  args?: string;
  desc: string;
}

function renderRow(row: HelpRow, width: number = 24): string {
  let plain = row.name;
  if (row.alias) plain += `, ${row.alias}`;
  if (row.args) plain += ` ${row.args}`;

  const spaces = " ".repeat(Math.max(2, width - plain.length));

  let colored = pc.cyan(row.name);
  if (row.alias) colored += `, ${pc.gray(row.alias)}`;
  if (row.args) colored += ` ${pc.gray(row.args)}`;

  return `    ${colored}${spaces}${pc.white(row.desc)}`;
}

export function formatRootHelp(programName: string = "gitbridge"): string {
  const isGb = programName === "gb";
  const header = (title: string) => pc.bold(pc.yellow(title));

  const workflows: HelpRow[] = [
    { name: "setup", desc: "Interactive onboarding wizard to configure identities & rules" },
    { name: "status", alias: "st", desc: "Show active identity, accounts, remotes, and routing rules" },
    { name: "context", alias: "ctx", desc: "Inspect Git and GitBridge identity context for current repo" },
    { name: "explain", desc: "Explain why GitBridge selected the current identity & configuration" },
    { name: "env", desc: "Print shell environment exports for current repository" },
    { name: "switch", alias: "sw", args: "[id]", desc: "Quickly switch active Git identity (locally or --global)" },
    { name: "init", desc: "Initialize a GitBridge profile for current Git repository" },
  ];

  const integrations: HelpRow[] = [
    { name: "override", desc: "Route native 'git' commands through GitBridge (enable | disable | status)" },
    { name: "ide", desc: "Sync IDE configurations (VS Code, Cursor, Antigravity) (sync | unsync | status)" },
    { name: "enable", desc: "Enable GitBridge integration in ~/.gitconfig and ~/.ssh/config" },
    { name: "disable", desc: "Disable GitBridge integration and safely restore original configs" },
    { name: "doctor", alias: "doc", desc: "Run comprehensive system health and diagnostic checks" },
  ];

  const management: HelpRow[] = [
    { name: "identity", alias: "id", desc: "Manage commit identities (list, add, use, remove)" },
    { name: "account", alias: "acc", desc: "Manage authenticated provider accounts (list, remove)" },
    { name: "auth", desc: "Authenticate with Git providers (login, logout)" },
    { name: "rule", alias: "rules", desc: "Manage automatic directory routing rules (list, add, remove)" },
    { name: "remote", alias: "rem", desc: "Manage multi-provider repository remotes (list, add)" },
    { name: "push", args: "[target]", desc: "Push current branch to configured remotes or multiple providers" },
    { name: "provider", alias: "prov", desc: "Inspect supported Git provider platforms (GitHub, GitLab, Bitbucket)" },
  ];

  return `
  ${pc.bold(pc.cyan("GitBridge 🌉"))} ${pc.gray("(v0.2.2)")}
  ${pc.gray("Universal Git Identity & Multi-Account Management Layer")}

  ${header("USAGE")}
    ${pc.bold(pc.green(programName))} ${pc.yellow("<command>")} ${pc.gray("[options]")}
${isGb ? "" : `    ${pc.bold(pc.green("gb"))} ${pc.yellow("<command>")} ${pc.gray("[options]")}\n`}
  ${header("CORE WORKFLOWS")}
${workflows.map((w) => renderRow(w)).join("\n")}

  ${header("INTEGRATIONS & OVERRIDES")}
${integrations.map((i) => renderRow(i)).join("\n")}

  ${header("MANAGEMENT & SECURITY")}
${management.map((m) => renderRow(m)).join("\n")}

  ${header("OPTIONS")}
    ${pc.yellow("-V, --version")}           ${pc.white("Output the version number")}
    ${pc.yellow("-h, --help")}              ${pc.white("Display this help message")}

  ${header("EXAMPLES")}
    ${pc.gray("$")} ${pc.cyan(`${programName} setup`)}              ${pc.gray("# Launch interactive onboarding wizard")}
    ${pc.gray("$")} ${pc.cyan(`${programName} switch work`)}        ${pc.gray("# Switch current repository identity to 'work'")}
    ${pc.gray("$")} ${pc.cyan(`${programName} override enable`)}    ${pc.gray("# Route native 'git' commands through GitBridge")}
    ${pc.gray("$")} ${pc.cyan(`${programName} ide sync`)}           ${pc.gray("# Link VS Code & Cursor with GitBridge shims")}
    ${pc.gray("$")} ${pc.cyan(`${programName} status`)}             ${pc.gray("# View active identities, accounts, and rules")}
    ${pc.gray("$")} ${pc.cyan(`${programName} push --all`)}         ${pc.gray("# Push to GitHub, GitLab & Bitbucket simultaneously")}
    ${pc.gray("$")} ${pc.cyan(`${programName} doctor`)}             ${pc.gray("# Run system diagnostics and connectivity tests")}

  ${header("LEARN MORE")}
    Run ${pc.cyan(`${programName} <command> --help`)} for detailed arguments and options for any command.
    Documentation: ${pc.underline(pc.cyan("https://github.com/FuadTesfaye/gitbridge"))}
`;
}

export function configureProgramHelp(program: Command, programName: string = "gitbridge"): void {
  // Override root help
  program.helpInformation = function () {
    return formatRootHelp(programName);
  };

  // Configure custom styling for subcommands
  program.configureHelp({
    subcommandTerm: (cmd) => pc.cyan(cmd.name()) + (cmd.alias() ? `, ${pc.gray(cmd.alias())}` : ""),
    optionTerm: (opt) => pc.yellow(opt.flags),
    commandDescription: (cmd) => pc.white(cmd.description()),
    subcommandDescription: (cmd) => pc.white(cmd.description()),
    optionDescription: (opt) => pc.white(opt.description),
  });
}
