import ora from "ora";
import pc from "picocolors";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { defaultProviderRegistry } from "@/core/providers/provider-registry";
import { StoreFactory } from "@/core/storage/store-factory";
import { SshConfigGenerator } from "@/core/ssh/ssh-config-generator";
import { SshKeyDetector } from "@/core/ssh/ssh-key-detector";
import { promptSelect, promptConfirm, promptPassword, promptText } from "../ui/prompts";
import { isHttpUrl } from "@/utils/hosts";
import { isSafeSshIdentityFile, sanitizeSshKeyPath } from "@/utils/security";
import { logger } from "@/utils/logger";
import type { GitProviderType } from "@/core/config/schema";
import { buildAccountId } from "@/core/config/account-id";
import { verifyAccountUsername } from "@/core/providers/account-username";

export interface AuthLoginOptions {
  token?: string;
  host?: string;
  sshKey?: string;
  username?: string;
  password?: string;
  insecureHttp?: boolean;
  /** Setup collects just the username and PAT; SSH can be linked later. */
  patOnly?: boolean;
  skipSsh?: boolean;
}

export async function handleAuthLogin(
  providerName?: string,
  options: AuthLoginOptions = {},
  store: ConfigStore = defaultConfigStore
): Promise<boolean> {
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
    return false;
  }

  const host = options.host || provider.defaultHost;
  if (isHttpUrl(host) && !options.insecureHttp) {
    logger.error(`Refusing cleartext HTTP host '${host}'. Use HTTPS or pass --insecure-http.`);
    return false;
  }
  const prevAllowHttp = process.env.GITBRIDGE_ALLOW_HTTP;
  if (options.insecureHttp) {
    process.env.GITBRIDGE_ALLOW_HTTP = "1";
  }
  let token = options.token;
  let username = "";
  let authType: "pat" | "oauth" | "password" = "pat";
  try {
    const expectedUsername = options.username?.trim() || (!options.token && !options.password
      ? (await promptText({
          message: `Enter the ${provider.name} username you are authorizing:`,
          validate: (value) => !value.trim() ? "Username cannot be empty." : undefined,
        })).trim()
      : undefined);

    // Password / OAuth token retrieval if username and password provided
    if (!token && options.username && options.password && targetProvider === "gitlab") {
      const gl = provider as any;
      if (typeof gl.loginWithPassword === "function") {
        const spin = ora("Authenticating with GitLab via credentials...").start();
        try {
          const loginRes = await gl.loginWithPassword(options.username, options.password, host);
          token = loginRes.token;
          authType = "password";
          spin.succeed("Authenticated with GitLab!");
        } catch (e: any) {
          spin.fail("GitLab password authentication failed.");
          logger.error(e?.message || String(e));
          return false;
        }
      }
    }

    if (!token) {
      if (!options.patOnly && targetProvider === "github" && provider.startDeviceFlow && provider.pollDeviceFlow) {
        const method = await promptSelect({
          message: "Choose authentication method for GitHub:",
          options: [
            { value: "device", label: "Web Browser (Device Code Authorization)" },
            { value: "pat", label: "Personal Access Token (PAT)" },
          ],
        });

        if (method === "device" && process.env.GITBRIDGE_GITHUB_CLIENT_ID) {
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
            authType = "oauth";
            pollSpinner.succeed("Authorization granted!");
          } catch (err: unknown) {
            spinner.fail("Device flow failed.");
            logger.error(err instanceof Error ? err.message : String(err));
            return false;
          }
        } else if (method === "device") {
          logger.warn(
            "GitHub device login requires GITBRIDGE_GITHUB_CLIENT_ID (register your own GitHub OAuth/GitHub App). Using a Personal Access Token instead."
          );
        }
      }

      if (!token) {
        token = await promptPassword({
          message: `Enter your Personal Access Token (PAT) for ${provider.name} (${host}):`,
          validate: (val) => (!val || !val.trim() ? "Token cannot be empty." : undefined),
        });
      }
    }
    token = token.trim();

    const spinner = ora(`Validating credentials with ${provider.name}...`).start();

    try {
      const user = await provider.getUser(token, host);
      // Password login already verified its username/email at the token endpoint.
      verifyAccountUsername(options.password ? undefined : expectedUsername, user.username);
      username = user.username;
      spinner.succeed(`Authenticated as ${pc.green(user.displayName || user.username)} (@${user.username})`);

      // Ask for SSH key association
      let sshKeyPath = options.sshKey ? sanitizeSshKeyPath(options.sshKey) : undefined;
      if (sshKeyPath && !isSafeSshIdentityFile(sshKeyPath)) {
        logger.error("Refusing unsafe SSH key path.");
        sshKeyPath = undefined;
      }
      if (!sshKeyPath && !options.skipSsh) {
        const availableKeys = SshKeyDetector.listAvailableKeys(store.getPathResolver().getUserSshDir());
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
      const accountId = buildAccountId(targetProvider, username, cleanHost, provider.defaultHost, store.loadAccounts());
      const existingAccount = store.getAccount(accountId);

      // Persist credentials before registering the account so failed writes do not
      // leave a newly connected account without a usable token.
      const credStore = await StoreFactory.getStore(store.getPathResolver());
      const written = await credStore.set(cleanHost, accountId, token);

      // Enable provider if not already enabled
      defaultProviderRegistry.enableProvider(targetProvider, store);

      // Save account
      store.addAccount({
        id: accountId,
        providerId: targetProvider,
        host: cleanHost,
        username,
        displayName: user.displayName || undefined,
        email: user.email || undefined,
        authType,
        sshKeyPath: sshKeyPath || existingAccount?.sshKeyPath,
      });

      // Update SSH config
      const sshGen = new SshConfigGenerator(store);
      sshGen.generate();

      if (written.usedFallback) {
        logger.warn(`Account '${accountId}' registered, but the OS keyring refused the token: ${written.fallbackReason}`);
        logger.warn(
          `The token is stored in the encrypted vault at ${store.getPathResolver().getEncryptedVaultFile()} instead. Any process running as your user can decrypt that file.`
        );
      } else {
        logger.success(`Account '${accountId}' registered and token stored in ${written.backend}.`);
      }
      console.log(pc.gray(`  Host:      ${cleanHost}`));
      console.log(pc.gray(`  Username:  ${username}`));
      if (sshKeyPath) {
        console.log(pc.gray(`  SSH Alias: ${cleanHost}-${accountId}`));
      }
      console.log("");
      return true;
    } catch (err: unknown) {
      spinner.fail(`Authentication failed.`);
      logger.error(err instanceof Error ? err.message : String(err));
      return false;
    }
  } finally {
    if (prevAllowHttp === undefined) delete process.env.GITBRIDGE_ALLOW_HTTP;
    else process.env.GITBRIDGE_ALLOW_HTTP = prevAllowHttp;
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
