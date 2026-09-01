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
