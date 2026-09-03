import ora from "ora";
import pc from "picocolors";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { ProviderDetector } from "@/core/providers/provider-detector";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";
import { handleIdentityAdd } from "./identity";
import { handleAuthLogin } from "./auth";
import { handleRuleAdd } from "./rule";
import { handleEnableCommand } from "./enable";
import { promptConfirm, promptMultiSelect, promptSelect, promptText } from "../ui/prompts";
import { showBanner } from "../ui/banners";
import { logger } from "@/utils/logger";
import type { GitProviderType } from "@/core/config/schema";

export interface SetupOptions {
  quick?: boolean;
}

export async function handleSetupCommand(options: SetupOptions = {}, store: ConfigStore = defaultConfigStore) {
  showBanner();
  console.log(pc.bold("  GitBridge Setup\n"));
  console.log(pc.gray("  Let's configure only the providers and identities you actually use.\n"));

  const spinner = ora("Checking your system and detecting Git environment...").start();
  const detector = new ProviderDetector(store);
  const discovery = await detector.detectSystemProviders();
  spinner.succeed("System inspection completed!");

  console.log(pc.bold("\n  SYSTEM ENVIRONMENT"));
  console.log("  ──────────────────────────────────────────────────");
  if (discovery.gitInstalled) {
    console.log(`  ${pc.green("✔")} Git CLI:            ${pc.cyan(discovery.gitVersion || "Installed")}`);
  } else {
    console.log(`  ${pc.red("✖")} Git CLI:            ${pc.red("Not found in PATH")}`);
  }

  if (discovery.sshKeysFound.length > 0) {
    console.log(`  ${pc.green("✔")} SSH Keys:           ${pc.cyan(`Found ${discovery.sshKeysFound.length} keys`)} ${pc.gray(`(${discovery.sshKeysFound.join(", ")})`)}`);
  } else {
    console.log(`  ${pc.gray("○")} SSH Keys:           ${pc.gray("No keys found in ~/.ssh")}`);
  }

  if (discovery.existingGitUser?.name || discovery.existingGitUser?.email) {
    console.log(
      `  ${pc.green("✔")} Git Identity:       ${pc.cyan(discovery.existingGitUser.name || "")} ${pc.gray(`<${discovery.existingGitUser.email || ""}>`)}`
    );
  }

  console.log(pc.bold("\n  DETECTED GIT PROVIDERS"));
  console.log("  ──────────────────────────────────────────────────");
  for (const prov of discovery.detectedProviders) {
    if (prov.detected) {
      console.log(`  ${pc.green("✔")} ${pc.bold(prov.name)}:             ${pc.green("Active")} ${pc.gray(`(via ${prov.sources.join(", ")})`)}`);
    } else {
      console.log(`  ${pc.gray("○")} ${prov.name}:             ${pc.gray("Not detected")}`);
    }
  }

  // --- Quick Setup Mode ---
  if (options.quick) {
    console.log(pc.cyan("\n── Quick Mode: Applying automatic configuration ────\n"));
    const detectedIds = discovery.detectedProviders.filter((p) => p.detected).map((p) => p.providerId);
    const providersToEnable = detectedIds.length > 0 ? detectedIds : (["github"] as GitProviderType[]);

    for (const p of defaultProviderRegistry.listSupported()) {
      if (providersToEnable.includes(p.id)) {
        defaultProviderRegistry.enableProvider(p.id, store);
      } else {
        defaultProviderRegistry.disableProvider(p.id, store);
      }
    }

    // Configure identity if not already created
    if (store.loadIdentities().length === 0) {
      const name = discovery.existingGitUser?.name || "Fuad Tesfaye";
      const email = discovery.existingGitUser?.email || "user@example.com";
      store.addIdentity({
        id: "personal",
        name,
        email,
        isDefault: true,
      });
    }

    await handleEnableCommand(store);
    logger.success("GitBridge quick setup finished!");
    console.log(pc.gray(`  Managed providers: ${providersToEnable.join(", ")}`));
    console.log(pc.cyan("  Run 'gb status' to view active configuration.\n"));
    return;
  }

  // --- Step 1: Provider Selection ---
  console.log(pc.cyan("\n── Step 1: Select Providers to Manage ──────────────\n"));
  const detectedIds = discovery.detectedProviders.filter((p) => p.detected).map((p) => p.providerId);
  const defaultSelected = detectedIds.length > 0 ? detectedIds : (["github"] as GitProviderType[]);

  const selectedProviders = await promptMultiSelect<GitProviderType>({
    message: "Which Git providers should GitBridge manage? (Space to toggle):",
    options: defaultProviderRegistry.listSupported().map((p) => ({
      value: p.id,
      label: p.name,
      hint: detectedIds.includes(p.id) ? "Detected in your system" : "Available",
    })),
    initialValues: defaultSelected,
  });

  // Enable selected, disable unselected
  for (const p of defaultProviderRegistry.listSupported()) {
    if (selectedProviders.includes(p.id)) {
      defaultProviderRegistry.enableProvider(p.id, store);
    } else {
      defaultProviderRegistry.disableProvider(p.id, store);
    }
  }

  // --- Step 2: Configure Selected Providers Only ---
  if (selectedProviders.length > 0) {
    console.log(pc.cyan("\n── Step 2: Configure Selected Providers ────────────\n"));
    for (const provId of selectedProviders) {
      const provider = defaultProviderRegistry.get(provId);
      if (!provider) continue;

      const existingAccounts = store.loadAccounts().filter((a) => a.providerId === provId);
      if (existingAccounts.length > 0) {
        console.log(`  ${pc.green("✔")} ${provider.name} has ${existingAccounts.length} account(s) configured: ${existingAccounts.map((a) => a.username).join(", ")}`);
        const addAnother = await promptConfirm({
          message: `Add another account for ${provider.name}?`,
          initialValue: false,
        });
        if (addAnother) {
          await handleAuthLogin(provId, {}, store);
        }
      } else {
        const connectNow = await promptConfirm({
          message: `Connect an account for ${provider.name} now?`,
          initialValue: true,
        });
        if (connectNow) {
          await handleAuthLogin(provId, {}, store);
        }
      }
    }
  }

  // --- Step 3: Git Identities ---
  console.log(pc.cyan("\n── Step 3: Git Commit Identities ───────────────────\n"));
  const existingIdentities = store.loadIdentities();

  if (existingIdentities.length > 0) {
    console.log(`  Configured identities: ${existingIdentities.map((i) => `${i.id} (${i.email})`).join(", ")}`);
    const addMore = await promptConfirm({
      message: "Do you want to add or modify an identity?",
      initialValue: false,
    });
    if (addMore) {
      await handleIdentityAdd({}, store);
    }
  } else {
    const suggestedName = discovery.existingGitUser?.name || "";
    const suggestedEmail = discovery.existingGitUser?.email || "";

    const name = await promptText({
      message: "Enter your full name for Git commits:",
      defaultValue: suggestedName,
      validate: (v) => (!v.trim() ? "Name cannot be empty." : undefined),
    });

    const email = await promptText({
      message: "Enter your primary email address for Git commits:",
      defaultValue: suggestedEmail,
      validate: (v) => (!v.includes("@") ? "Invalid email address." : undefined),
    });

    store.addIdentity({
      id: "personal",
      name,
      email,
      isDefault: true,
    });
    logger.success(`Primary identity 'personal' (${email}) saved!`);

    const addWork = await promptConfirm({
      message: "Do you also want to add a work or secondary identity?",
      initialValue: true,
    });
    if (addWork) {
      await handleIdentityAdd({ id: "work", default: false }, store);
    }
  }

  // --- Step 4: Directory Routing Rules ---
  console.log(pc.cyan("\n── Step 4: Workspace Directory Routing ─────────────\n"));
  const addDirRule = await promptConfirm({
    message: "Do you want to map a workspace folder (e.g. ~/work or ~/Personal) to an identity?",
    initialValue: true,
  });

  if (addDirRule) {
    await handleRuleAdd(undefined, undefined, {}, store);
  }

  // --- Step 5: Activate Git & SSH Integration ---
  console.log(pc.cyan("\n── Step 5: Activate Git & SSH Integration ──────────\n"));
  await handleEnableCommand(store);

  logger.success("GitBridge setup completed successfully!");
  console.log(pc.bold("\n  Managed Providers:"));
  for (const provId of selectedProviders) {
    console.log(`    ${pc.green("✔")} ${provId.toUpperCase()}`);
  }

  console.log(pc.bold("\n  Next Steps:"));
  console.log(`    ${pc.cyan("gb ctx")}         ${pc.gray("# inspect identity resolution in current folder")}`);
  console.log(`    ${pc.cyan("gb st")}          ${pc.gray("# view complete GitBridge overview")}`);
  console.log(`    ${pc.cyan("gb explain")}     ${pc.gray("# see why GitBridge selected a particular identity")}\n`);
}
