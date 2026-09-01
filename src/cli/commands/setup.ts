import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { handleIdentityAdd } from "./identity";
import { handleAuthLogin } from "./auth";
import { handleRuleAdd } from "./rule";
import { handleEnableCommand } from "./enable";
import { promptConfirm, promptMultiSelect } from "../ui/prompts";
import { showBanner } from "../ui/banners";
import { logger } from "@/utils/logger";
import pc from "picocolors";
import type { GitProviderType } from "@/core/config/schema";

export async function handleSetupCommand(store: ConfigStore = defaultConfigStore) {
  showBanner();
  console.log(pc.bold("  Welcome to GitBridge Interactive Onboarding!\n"));
  console.log(pc.gray("  Let's set up your Git identities, provider connections, and workspace rules.\n"));

  // 1. Create Primary Identity
  console.log(pc.cyan("── Step 1: Create your Primary Git Identity ─────────\n"));
  await handleIdentityAdd({ id: "personal", default: true }, store);

  // Option for Second Identity (e.g. Work)
  const addWork = await promptConfirm({
    message: "Do you also want to create a Work or secondary identity now?",
    initialValue: true,
  });

  if (addWork) {
    console.log(pc.cyan("\n── Step 1b: Create Work Git Identity ───────────────\n"));
    await handleIdentityAdd({ id: "work", default: false }, store);
  }

  // 2. Provider Connections
  console.log(pc.cyan("\n── Step 2: Connect Git Providers ───────────────────\n"));
  const selectedProviders = await promptMultiSelect<GitProviderType>({
    message: "Which Git providers do you use? (Select with spacebar):",
    options: [
      { value: "github", label: "GitHub" },
      { value: "gitlab", label: "GitLab" },
      { value: "bitbucket", label: "Bitbucket" },
    ],
  });

  for (const prov of selectedProviders) {
    const loginNow = await promptConfirm({
      message: `Do you want to log in to ${prov.toUpperCase()} right now?`,
      initialValue: true,
    });
    if (loginNow) {
      await handleAuthLogin(prov, {}, store);
    }
  }

  // 3. Directory Rules
  console.log(pc.cyan("\n── Step 3: Workspace Directory Routing ─────────────\n"));
  const addDirRule = await promptConfirm({
    message: "Do you want to map a directory (e.g. ~/Projects/work) to an identity?",
    initialValue: true,
  });

  if (addDirRule) {
    await handleRuleAdd(undefined, undefined, {}, store);
  }

  // 4. Enable Integration
  console.log(pc.cyan("\n── Step 4: Activate Git Integration ────────────────\n"));
  await handleEnableCommand(store);

  logger.success("GitBridge setup completed successfully!");
  console.log(pc.bold("\n  You're all set! Try running:"));
  console.log(pc.cyan("    gitbridge status") + pc.gray("     # view configured status"));
  console.log(pc.cyan("    gitbridge context") + pc.gray("    # inspect current directory"));
  console.log(pc.cyan("    gitbridge doctor") + pc.gray("     # run system diagnostics\n"));
}
