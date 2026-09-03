import path from "node:path";
import fs from "node:fs";
import Table from "cli-table3";
import pc from "picocolors";
import { SshKeyDetector } from "@/core/ssh/ssh-key-detector";
import { SshConfigGenerator } from "@/core/ssh/ssh-config-generator";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { promptSelect, promptText, promptConfirm } from "../ui/prompts";
import { execProcess } from "@/utils/proc";
import { logger } from "@/utils/logger";
import { getHomeDir } from "@/utils/platform";

export async function handleSshList(store: ConfigStore = defaultConfigStore) {
  const keys = SshKeyDetector.listAvailableKeys();
  const accounts = store.loadAccounts();

  console.log(pc.bold("\n  SSH KEYS"));
  console.log("  ──────────────────────────────────────────────────");

  if (keys.length === 0) {
    console.log(pc.gray("  No SSH keys found in ~/.ssh."));
    console.log(pc.cyan("  Run 'gb ssh generate' to create a new SSH key.\n"));
    return;
  }

  const table = new Table({
    head: [pc.bold("Key Name"), pc.bold("Type"), pc.bold("Path"), pc.bold("Linked Account")],
    style: { head: ["cyan"] },
  });

  for (const k of keys) {
    const linked = accounts.find((a) => a.sshKeyPath === k.privateKeyPath);
    const linkedStr = linked ? pc.green(`${linked.providerId}:${linked.username}`) : pc.gray("none");

    table.push([
      pc.bold(k.name),
      pc.cyan(k.type),
      pc.gray(k.privateKeyPath),
      linkedStr,
    ]);
  }

  console.log(table.toString());
  console.log(pc.gray("\n  • Run 'gb ssh generate' to generate a new ed25519 SSH key."));
  console.log(pc.gray("  • Run 'gb ssh link' to connect a key to an account.\n"));
}

export async function handleSshGenerate(
  options: { name?: string; email?: string } = {},
  store: ConfigStore = defaultConfigStore
) {
  console.log(pc.bold("\n  GENERATE SSH KEY"));
  console.log("  ──────────────────────────────────────────────────");

  const home = getHomeDir();
  const sshDir = path.join(home, ".ssh");
  if (!fs.existsSync(sshDir)) {
    fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
  }

  const keyName =
    options.name ||
    (await promptText({
      message: "Enter name for the new SSH key (e.g. id_ed25519_company, id_work):",
      defaultValue: "id_ed25519_gitbridge",
      validate: (v) => (!v.trim() ? "Key name cannot be empty." : undefined),
    }));

  const targetPath = path.join(sshDir, keyName.trim());
  if (fs.existsSync(targetPath)) {
    logger.error(`File '${targetPath}' already exists. Please choose a different name.`);
    return;
  }

  const comment =
    options.email ||
    (await promptText({
      message: "Enter email / comment for this key:",
      defaultValue: store.loadConfig().defaultIdentityId
        ? store.loadIdentities().find((i) => i.id === store.loadConfig().defaultIdentityId)?.email || ""
        : "",
    }));

  console.log(pc.cyan(`\nGenerating ed25519 SSH key at ${targetPath}...`));
  const res = await execProcess("ssh-keygen", ["-t", "ed25519", "-C", comment, "-f", targetPath, "-N", ""]);

  if (res.exitCode !== 0) {
    logger.error(`ssh-keygen failed: ${res.stderr || res.stdout}`);
    return;
  }

  logger.success(`SSH key generated successfully!`);
  console.log(pc.gray(`  Private Key: ${targetPath}`));
  console.log(pc.gray(`  Public Key:  ${targetPath}.pub\n`));

  const pubContent = fs.readFileSync(`${targetPath}.pub`, "utf-8").trim();
  console.log(pc.bold("  Public Key (copy this to your Git provider):"));
  console.log(pc.yellow(`  ${pubContent}\n`));

  // Ask to link to account
  const accounts = store.loadAccounts();
  if (accounts.length > 0) {
    const link = await promptConfirm({
      message: "Do you want to link this new SSH key to an authenticated account now?",
      initialValue: true,
    });

    if (link) {
      const selectedAccountId = await promptSelect({
        message: "Select account to link with this key:",
        options: accounts.map((a) => ({
          value: a.id,
          label: `${a.providerId.toUpperCase()} (${a.username})`,
        })),
      });

      const updated = accounts.map((a) => (a.id === selectedAccountId ? { ...a, sshKeyPath: targetPath } : a));
      store.saveAccounts(updated);

      const sshGen = new SshConfigGenerator(store);
      sshGen.generate();

      logger.success(`SSH key linked to account '${selectedAccountId}' and ssh_config updated!`);
    }
  }
}

export async function handleSshLink(
  keyPathArg?: string,
  accountIdArg?: string,
  store: ConfigStore = defaultConfigStore
) {
  const keys = SshKeyDetector.listAvailableKeys();
  const accounts = store.loadAccounts();

  if (keys.length === 0) {
    logger.error("No SSH keys found in ~/.ssh. Run 'gb ssh generate' first.");
    return;
  }

  if (accounts.length === 0) {
    logger.error("No Git provider accounts registered. Run 'gb auth login' first.");
    return;
  }

  let selectedKeyPath = keyPathArg;
  if (!selectedKeyPath) {
    selectedKeyPath = await promptSelect({
      message: "Select SSH key to link:",
      options: keys.map((k) => ({
        value: k.privateKeyPath,
        label: `${k.name} (${k.type})`,
        hint: k.comment,
      })),
    });
  }

  let selectedAccountId = accountIdArg;
  if (!selectedAccountId) {
    selectedAccountId = await promptSelect({
      message: "Select account to associate with this key:",
      options: accounts.map((a) => ({
        value: a.id,
        label: `${a.providerId.toUpperCase()} (${a.username})`,
        hint: a.host,
      })),
    });
  }

  const updated = accounts.map((a) => (a.id === selectedAccountId ? { ...a, sshKeyPath: selectedKeyPath } : a));
  store.saveAccounts(updated);

  const sshGen = new SshConfigGenerator(store);
  sshGen.generate();

  logger.success(`SSH key linked to '${selectedAccountId}'!`);
}
