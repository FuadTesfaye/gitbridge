import ora from "ora";
import pc from "picocolors";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";
import { StoreFactory } from "@/core/storage/store-factory";
import { SshConfigGenerator } from "@/core/ssh/ssh-config-generator";
import { SshKeyDetector } from "@/core/ssh/ssh-key-detector";
import { promptSelect, promptText, promptConfirm } from "../ui/prompts";
import { logger } from "@/utils/logger";
import type { GitProviderType } from "@/core/config/schema";

export interface AuthLoginOptions {
  token?: string;
  host?: string;
  sshKey?: string;
  username?: string;
  password?: string;
}

export async function handleAuthLogin(
  providerName?: string,
  options: AuthLoginOptions = {},
  store: ConfigStore = defaultConfigStore
) {
  let targetProvider = providerName?.toLowerCase() as GitProviderType | undefined;

  if (!targetProvider) {
    targetProvider = await promptSelect<GitProviderType>({
      message: "Select Git Provider to authenticate with:",
      options: [
        { value: "github", label: "GitHub (github.com / Enterprise)" },
        { value: "gitlab", label: "GitLab (gitlab.com / Self-Hosted)" },
        { value: "bitbucket", label: "Bitbucket (bitbucket.org / Server)" },
      ],
    });
  }

  const provider = defaultProviderRegistry.get(targetProvider);
  if (!provider) {
    logger.error(`Unknown provider: '${targetProvider}'`);
    return;
  }

  const host = options.host || provider.defaultHost;
  let token = options.token;
  let username = "";

  // Password / OAuth token retrieval if username and password provided
  if (!token && options.username && options.password && targetProvider === "gitlab") {
    const gl = provider as any;
    if (typeof gl.loginWithPassword === "function") {
      const spin = ora("Authenticating with GitLab via credentials...").start();
      try {
        const loginRes = await gl.loginWithPassword(options.username, options.password, host);
        token = loginRes.token;
        spin.succeed("Authenticated with GitLab!");
      } catch (e: any) {
        spin.fail("GitLab password authentication failed.");
        logger.error(e?.message || String(e));
        return;
      }
    }
  }

  if (!token) {
    if (targetProvider === "github" && provider.startDeviceFlow && provider.pollDeviceFlow) {
      const method = await promptSelect({
        message: "Choose authentication method for GitHub:",
        options: [
          { value: "device", label: "Web Browser (Device Code Authorization)" },
          { value: "pat", label: "Personal Access Token (PAT)" },
        ],
      });

      if (method === "device") {
        const spinner = ora("Initiating GitHub Device Authorization...").start();
        try {
          const deviceFlow = await provider.startDeviceFlow();
          spinner.stop();

          console.log("\n  " + pc.bold(pc.cyan("GitHub Device Authorization")));
          console.log(`  1. Open your browser: ${pc.underline(pc.cyan(deviceFlow.verificationUri))}`);
          console.log(`  2. Enter the one-time code: ${pc.bold(pc.green(deviceFlow.userCode))}\n`);

          const pollSpinner = ora("Waiting for browser authorization...").start();
          const authResult = await provider.pollDeviceFlow(deviceFlow.deviceCode, deviceFlow.interval);
          token = authResult.token;
          pollSpinner.succeed("Authorization granted!");
        } catch (err: unknown) {
          spinner.fail("Device flow failed.");
          logger.error(err instanceof Error ? err.message : String(err));
          return;
        }
      }
    }

    if (!token) {
      token = await promptText({
        message: `Enter your Personal Access Token (PAT) for ${provider.name} (${host}):`,
        validate: (val) => (!val || !val.trim() ? "Token cannot be empty." : undefined),
      });
    }
  }

  const spinner = ora(`Validating credentials with ${provider.name}...`).start();

  try {
    const user = await provider.getUser(token, host);
    username = user.username;
    spinner.succeed(`Authenticated as ${pc.green(user.displayName || user.username)} (@${user.username})`);

    // Ask for SSH key association
    let sshKeyPath = options.sshKey;
    if (!sshKeyPath) {
      const availableKeys = SshKeyDetector.listAvailableKeys();
      if (availableKeys.length > 0) {
        const linkKey = await promptConfirm({
          message: `Do you want to link an SSH key for this ${provider.name} account?`,
          initialValue: true,
        });

        if (linkKey) {
          sshKeyPath = await promptSelect({
            message: "Select SSH key to link:",
            options: availableKeys.map((k) => ({
              value: k.privateKeyPath,
              label: `${k.name} (${k.type})`,
              hint: k.comment,
            })),
          });
        }
      }
    }

    const cleanHost = host.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const accountId = `${targetProvider}_${username.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    // Enable provider if not already enabled
    defaultProviderRegistry.enableProvider(targetProvider, store);

    // Save account
    store.addAccount({
      id: accountId,
      providerId: targetProvider,
      host: cleanHost,
      username,
      displayName: user.displayName,
      email: user.email,
      authType: "oauth",
      sshKeyPath,
    });

    // Save token in secure store
    const credStore = await StoreFactory.getStore(store.getPathResolver());
    await credStore.set(cleanHost, accountId, token);

    // Update SSH config
    const sshGen = new SshConfigGenerator(store);
    sshGen.generate();

    logger.success(`Account '${accountId}' registered and token secured in OS Keychain/Keyring!`);
    console.log(pc.gray(`  Host:      ${cleanHost}`));
    console.log(pc.gray(`  Username:  ${username}`));
    if (sshKeyPath) {
      console.log(pc.gray(`  SSH Alias: ${cleanHost}-${accountId}`));
    }
    console.log("");
  } catch (err: unknown) {
    spinner.fail(`Authentication failed.`);
    logger.error(err instanceof Error ? err.message : String(err));
  }
}

export async function handleAuthLogout(providerName: string, username?: string, store: ConfigStore = defaultConfigStore) {
  const accounts = store.loadAccounts().filter((a) => a.providerId === providerName);

  if (accounts.length === 0) {
    logger.warn(`No accounts found for provider '${providerName}'.`);
    return;
  }

  let targetAccount = accounts[0];
  if (username) {
    const found = accounts.find((a) => a.username === username);
    if (!found) {
      logger.error(`Account '${username}' not found for provider '${providerName}'.`);
      return;
    }
    targetAccount = found;
  }

  const credStore = await StoreFactory.getStore(store.getPathResolver());
  await credStore.delete(targetAccount.host, targetAccount.id);

  store.removeAccount(targetAccount.id);

  const sshGen = new SshConfigGenerator(store);
  sshGen.generate();

  logger.success(`Logged out of ${targetAccount.providerId} (${targetAccount.username}). Credentials removed.`);
}
