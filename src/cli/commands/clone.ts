import path from "node:path";
import fs from "node:fs";
import ora from "ora";
import pc from "picocolors";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { ProviderDetector } from "@/core/providers/provider-detector";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";
import { IdentityGuard } from "@/core/safety/identity-guard";
import { execProcess } from "@/utils/proc";
import { parseRemoteUrl } from "@/core/git/url-parser";
import { promptSelect, promptConfirm } from "../ui/prompts";
import { logger } from "@/utils/logger";
import type { GitProviderType } from "@/core/config/schema";

export interface CloneCommandOptions {
  profile?: string;
  identity?: string;
  account?: string;
}

export async function handleCloneCommand(
  url: string,
  destination?: string,
  options: CloneCommandOptions = {},
  store: ConfigStore = defaultConfigStore
) {
  if (!url || !url.trim()) {
    logger.error("Please provide a repository URL to clone (e.g. 'gb clone git@github.com:user/repo.git')");
    return;
  }

  const cleanUrl = url.trim();
  const detector = new ProviderDetector(store);
  let detection = detector.detectFromRemote(cleanUrl);

  console.log(pc.bold("\n  GITBRIDGE SMART CLONE"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(`  Target URL:             ${pc.cyan(cleanUrl)}`);

  // Handle unknown/custom provider
  if (!detection.isKnown && detection.providerId === "custom") {
    console.log(pc.yellow(`\n  ⚠ Unrecognized Git host: ${pc.bold(detection.host)}`));
    const chosenType = await promptSelect<GitProviderType>({
      message: `What Git platform is hosted at '${detection.host}'?`,
      options: [
        { value: "gitlab", label: "GitLab (Self-Hosted / Community / Enterprise)" },
        { value: "github", label: "GitHub Enterprise Server" },
        { value: "bitbucket", label: "Bitbucket Server / Data Center" },
        { value: "custom", label: "Generic / Custom Git Server" },
      ],
    });

    detection = {
      ...detection,
      providerId: chosenType,
      name: chosenType.toUpperCase(),
      isKnown: true,
    };

    // Save custom provider mapping
    const config = store.loadConfig();
    const existingCustom = config.customProviders || [];
    if (!existingCustom.some((c) => c.host === detection.host)) {
      store.saveConfig({
        customProviders: [
          ...existingCustom,
          {
            id: `custom_${detection.host.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
            name: `${chosenType.toUpperCase()} (${detection.host})`,
            host: detection.host,
            type: chosenType,
          },
        ],
      });
    }
  }

  console.log(`  Detected Provider:      ${pc.green(detection.name)} (${detection.host})`);

  // Auto-enable provider if not active
  if (!defaultProviderRegistry.isProviderEnabled(detection.providerId, store)) {
    defaultProviderRegistry.enableProvider(detection.providerId, store);
  }

  const accounts = store.loadAccounts().filter((a) => a.providerId === detection.providerId || a.host === detection.host);
  const identities = store.loadIdentities();

  let selectedAccountId: string | undefined = options.account;
  let selectedIdentityId: string | undefined = options.identity || options.profile;

  // Account Selection
  if (!selectedAccountId && accounts.length > 0) {
    if (accounts.length === 1) {
      selectedAccountId = accounts[0].id;
    } else {
      selectedAccountId = await promptSelect({
        message: `Select ${detection.name} account to clone with:`,
        options: accounts.map((a) => ({
          value: a.id,
          label: `${a.username} (${a.host})`,
          hint: a.sshKeyPath ? `SSH: ${path.basename(a.sshKeyPath)}` : "PAT Auth",
        })),
      });
    }
  }

  // Identity Selection
  if (!selectedIdentityId && identities.length > 0) {
    if (identities.length === 1) {
      selectedIdentityId = identities[0].id;
    } else {
      selectedIdentityId = await promptSelect({
        message: "Select commit author identity for this repository:",
        options: identities.map((i) => ({
          value: i.id,
          label: `${i.name} <${i.email}>`,
          hint: i.isDefault ? "Global Default" : undefined,
        })),
      });
    }
  }

  // Determine effective clone URL
  let cloneUrl = cleanUrl;
  const parsed = parseRemoteUrl(cleanUrl);
  if (selectedAccountId && parsed && cleanUrl.startsWith("git@")) {
    const account = accounts.find((a) => a.id === selectedAccountId);
    if (account) {
      const aliasHost = `${account.host}-${account.id}`;
      cloneUrl = `git@${aliasHost}:${parsed.owner ? `${parsed.owner}/` : ""}${parsed.repo}.git`;
    }
  }

  // Execute git clone
  const targetDirName = destination || (parsed ? parsed.repo : path.basename(cleanUrl).replace(/\.git$/, ""));
  const spinner = ora(`Cloning repository into '${targetDirName}'...`).start();

  const args = ["clone", cloneUrl];
  if (destination) {
    args.push(destination);
  }

  const result = await execProcess("git", args);
  if (result.exitCode !== 0) {
    spinner.fail("git clone failed.");
    console.error(pc.red(result.stderr || result.stdout));
    return;
  }
  spinner.succeed(`Cloned repository successfully into '${targetDirName}'!`);

  // Configure repository context inside cloned folder
  const repoAbsPath = path.resolve(process.cwd(), targetDirName);
  const gitDir = path.join(repoAbsPath, ".git");

  if (fs.existsSync(gitDir)) {
    // Write local repository override
    const localConfigPath = path.join(gitDir, "gitbridge.json");
    const localConfig = {
      profile: selectedIdentityId,
      identityId: selectedIdentityId,
      providerId: detection.providerId,
      accountId: selectedAccountId,
    };
    fs.writeFileSync(localConfigPath, JSON.stringify(localConfig, null, 2), "utf-8");

    // Install pre-commit safety hook
    const guard = new IdentityGuard(store);
    await guard.installPreCommitHook(repoAbsPath);

    logger.success("GitBridge context configured for repository!");
    console.log(pc.gray(`  Location:   ${repoAbsPath}`));
    console.log(pc.gray(`  Identity:   ${selectedIdentityId || "global default"}`));
    if (selectedAccountId) {
      console.log(pc.gray(`  Account:    ${selectedAccountId}`));
    }
    console.log(pc.green(`  Safety Hook: Installed in .git/hooks/pre-commit\n`));
  }
}
