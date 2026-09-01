import Table from "cli-table3";
import pc from "picocolors";
import type { GitIdentity, ProviderAccount, DirectoryRule } from "@/core/config/schema";
import type { GitRemoteInfo } from "@/core/git/git-cli";

export function renderIdentitiesTable(identities: GitIdentity[], defaultId: string | null): string {
  if (identities.length === 0) {
    return pc.gray("  No identities configured yet. Run 'gitbridge identity add' to create one.\n");
  }

  const table = new Table({
    head: [pc.bold("ID"), pc.bold("Name"), pc.bold("Email"), pc.bold("Default"), pc.bold("Signing Key")],
    style: { head: ["cyan"] },
  });

  for (const id of identities) {
    const isDef = id.id === defaultId || id.isDefault;
    table.push([
      pc.cyan(id.id),
      id.name,
      id.email,
      isDef ? pc.green("✔ yes") : pc.gray("no"),
      id.signingKey ? pc.yellow(id.signingKey.slice(0, 20) + "...") : pc.gray("none"),
    ]);
  }

  return table.toString();
}

export function renderAccountsTable(accounts: ProviderAccount[]): string {
  if (accounts.length === 0) {
    return pc.gray("  No accounts logged in yet. Run 'gitbridge auth login <provider>' to add one.\n");
  }

  const table = new Table({
    head: [pc.bold("ID"), pc.bold("Provider"), pc.bold("Username"), pc.bold("Host"), pc.bold("Auth Type"), pc.bold("SSH Key")],
    style: { head: ["cyan"] },
  });

  for (const acc of accounts) {
    table.push([
      pc.cyan(acc.id),
      pc.magenta(acc.providerId.toUpperCase()),
      acc.username,
      acc.host,
      acc.authType,
      acc.sshKeyPath ? pc.yellow(acc.sshKeyPath) : pc.gray("none"),
    ]);
  }

  return table.toString();
}

export function renderRulesTable(rules: DirectoryRule[]): string {
  if (rules.length === 0) {
    return pc.gray("  No directory rules configured. Run 'gitbridge rule add' to map directories.\n");
  }

  const table = new Table({
    head: [pc.bold("Rule ID"), pc.bold("Directory Path"), pc.bold("Identity"), pc.bold("Provider"), pc.bold("Account")],
    style: { head: ["cyan"] },
  });

  for (const rule of rules) {
    table.push([
      pc.cyan(rule.id),
      pc.blue(rule.path),
      pc.green(rule.identityId),
      rule.defaultProvider ? pc.magenta(rule.defaultProvider) : pc.gray("any"),
      rule.defaultAccountId ? pc.yellow(rule.defaultAccountId) : pc.gray("any"),
    ]);
  }

  return table.toString();
}

export function renderRemotesTable(remotes: GitRemoteInfo[]): string {
  if (remotes.length === 0) {
    return pc.gray("  No Git remotes found.\n");
  }

  const table = new Table({
    head: [pc.bold("Remote"), pc.bold("Provider"), pc.bold("Host"), pc.bold("Repo / Org"), pc.bold("Account Alias")],
    style: { head: ["cyan"] },
  });

  for (const r of remotes) {
    const parsed = r.parsedPush || r.parsedFetch;
    table.push([
      pc.cyan(r.name),
      parsed ? pc.magenta(parsed.providerId.toUpperCase()) : pc.gray("unknown"),
      parsed ? parsed.host : pc.gray("unknown"),
      parsed ? parsed.fullName : pc.gray("unknown"),
      parsed?.accountAlias ? pc.yellow(parsed.accountAlias) : pc.gray("default"),
    ]);
  }

  return table.toString();
}
