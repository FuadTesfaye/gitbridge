import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { StoreFactory } from "@/core/storage/store-factory";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { hostsEqual } from "@/utils/hosts";

export interface GitCredentialPayload {
  protocol?: string;
  host?: string;
  path?: string;
  username?: string;
  password?: string;
}

export function parseGitCredentialInput(raw: string): GitCredentialPayload {
  const lines = raw.split("\n");
  const payload: GitCredentialPayload = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1);
      if (key === "protocol") payload.protocol = val;
      if (key === "host") payload.host = val;
      if (key === "path") payload.path = val;
      if (key === "username") payload.username = val;
      if (key === "password") payload.password = val;
    }
  }

  return payload;
}

export class GitCredentialHelperHandler {
  private store: ConfigStore;
  private resolver: IdentityResolver;

  constructor(store: ConfigStore = defaultConfigStore) {
    this.store = store;
    this.resolver = new IdentityResolver(store);
  }

  async handleGet(input: string, cwd: string = process.cwd()): Promise<string> {
    const payload = parseGitCredentialInput(input);
    if (!payload.host) return "";
    const requestedHost = payload.host;
    // Never emit secrets for cleartext HTTP.
    if (payload.protocol && payload.protocol !== "https") return "";

    const accounts = this.store.loadAccounts();
    const config = this.store.loadConfig();

    if (!config.enabled) return "";

    const hostAccounts = accounts.filter((a) => hostsEqual(a.host, requestedHost));
    if (hostAccounts.length === 0) return "";

    const ctx = await this.resolver.resolve(cwd);

    let targetAccount = null;
    // Context account is only eligible if it is for THIS host.
    if (ctx.account && hostsEqual(ctx.account.host, requestedHost)) {
      if (!payload.username || payload.username === ctx.account.username) {
        targetAccount = ctx.account;
      }
    }

    if (!targetAccount && payload.username) {
      targetAccount = hostAccounts.find((a) => a.username === payload.username) || null;
    }

    // Do not guess among multiple accounts for the same host.
    if (!targetAccount) {
      if (hostAccounts.length === 1) {
        targetAccount = hostAccounts[0];
      } else {
        return "";
      }
    }

    if (!hostsEqual(targetAccount.host, requestedHost)) return "";

    const credStore = await StoreFactory.getStore(this.store.getPathResolver());
    let token = await credStore.get(targetAccount.host, targetAccount.id);

    if (!token) {
      const fallbackId = `${targetAccount.host.replace(/[^a-zA-Z0-9]/g, "_")}_${targetAccount.username}`;
      token = await credStore.get(targetAccount.host, fallbackId);
    }

    if (!token) return "";

    const lines = [
      `username=${targetAccount.username}`,
      `password=${token}`,
      "", // trailing newline required by Git protocol
    ];

    return lines.join("\n");
  }

  async handleStore(input: string): Promise<void> {
    const payload = parseGitCredentialInput(input);
    if (!payload.host || !payload.username || !payload.password) return;
    if (payload.protocol && payload.protocol !== "https") return;

    const credStore = await StoreFactory.getStore(this.store.getPathResolver());
    const accounts = this.store.loadAccounts();
    const existing = accounts.find((a) => a.host === payload.host && a.username === payload.username);
    const accountId = existing ? existing.id : `${payload.host.replace(/[^a-zA-Z0-9]/g, "_")}_${payload.username}`;

    await credStore.set(payload.host, accountId, payload.password);
  }

  async handleErase(input: string): Promise<void> {
    const payload = parseGitCredentialInput(input);
    if (!payload.host || !payload.username) return;

    const credStore = await StoreFactory.getStore(this.store.getPathResolver());
    const accounts = this.store.loadAccounts();
    const existing = accounts.find((a) => a.host === payload.host && a.username === payload.username);
    const accountId = existing ? existing.id : `${payload.host.replace(/[^a-zA-Z0-9]/g, "_")}_${payload.username}`;

    await credStore.delete(payload.host, accountId);
  }
}

import { readStdin } from "@/utils/proc";

export async function handleCredentialCommand(
  action: "get" | "store" | "erase",
  stdinData?: string,
  store: ConfigStore = defaultConfigStore
) {
  const handler = new GitCredentialHelperHandler(store);

  let input = stdinData;
  if (input === undefined) {
    input = await readStdin();
  }

  if (action === "get") {
    const output = await handler.handleGet(input);
    if (output) {
      process.stdout.write(output);
    }
  } else if (action === "store") {
    await handler.handleStore(input);
  } else if (action === "erase") {
    await handler.handleErase(input);
  }
}
