import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { StoreFactory } from "@/core/storage/store-factory";
import { SshConfigGenerator } from "@/core/ssh/ssh-config-generator";
import { renderAccountsTable } from "../ui/tables";
import { logger } from "@/utils/logger";
import pc from "picocolors";

export async function handleAccountList(store: ConfigStore = defaultConfigStore) {
  const accounts = store.loadAccounts();

  console.log(pc.bold("\n  AUTHENTICATED PROVIDER ACCOUNTS"));
  console.log("  ──────────────────────────────────────────────────");
  console.log(renderAccountsTable(accounts));
}

export async function handleAccountRemove(id: string, store: ConfigStore = defaultConfigStore) {
  const account = store.getAccount(id);
  if (!account) {
    logger.error(`Account with ID '${id}' not found.`);
    return;
  }

  // Delete credential from secure store
  const credStore = await StoreFactory.getStore(store.getPathResolver());
  await credStore.delete(account.host, account.id);

  store.removeAccount(id);

  const sshGen = new SshConfigGenerator(store);
  sshGen.generate();

  logger.success(`Removed account '${id}' and erased credentials.`);
}

export async function handleAccountAdd(
  options: { provider?: string; token?: string; username?: string; password?: string; host?: string; sshKey?: string } = {},
  store: ConfigStore = defaultConfigStore
) {
  const { handleAuthLogin } = await import("./auth");
  return handleAuthLogin(options.provider, options, store);
}

export async function handleAccountUse(
  providerOrAccount: string,
  accountIdArg?: string,
  store: ConfigStore = defaultConfigStore
) {
  const accounts = store.loadAccounts();
  if (accounts.length === 0) {
    logger.error("No authenticated provider accounts found. Run 'gb auth login' or 'gb account add'.");
    return;
  }

  // Case 1: gb account use github company-a
  if (accountIdArg) {
    const providerId = providerOrAccount.toLowerCase();
    const account = accounts.find((a) => a.id === accountIdArg || (a.providerId === providerId && a.username === accountIdArg));
    if (!account) {
      logger.error(`Account '${accountIdArg}' for provider '${providerId}' not found.`);
      return;
    }

    const config = store.loadConfig();
    const provConfig = config.providers[providerId] || { enabled: true };
    provConfig.defaultAccount = account.id;

    store.saveConfig({
      providers: {
        ...config.providers,
        [providerId]: provConfig,
      },
    });

    logger.success(`Set '${account.username}' (${account.id}) as default account for ${providerId.toUpperCase()}.`);
    return;
  }

  // Case 2: gb account use company-a
  const account = accounts.find((a) => a.id === providerOrAccount || a.username === providerOrAccount);
  if (!account) {
    logger.error(`Account '${providerOrAccount}' not found.`);
    return;
  }

  const config = store.loadConfig();
  const provConfig = config.providers[account.providerId] || { enabled: true };
  provConfig.defaultAccount = account.id;

  store.saveConfig({
    providers: {
      ...config.providers,
      [account.providerId]: provConfig,
    },
  });

  logger.success(`Set '${account.username}' (${account.id}) as default account for ${account.providerId.toUpperCase()}.`);
}

