import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { StoreFactory } from "@/core/storage/store-factory";
import { IdentityResolver } from "@/core/identity/identity-resolver";

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

    const accounts = this.store.loadAccounts();
    const config = this.store.loadConfig();

    if (!config.enabled) return "";

    // 1. Resolve context for cwd
    const ctx = await this.resolver.resolve(cwd);

    let targetAccount = ctx.account;

    // 2. If no account in resolved context, find account by host and matching username or first for host
    if (!targetAccount) {
      if (payload.username) {
        targetAccount = accounts.find((a) => a.host === payload.host && a.username === payload.username) || null;
      }
      if (!targetAccount) {
        targetAccount = accounts.find((a) => a.host === payload.host) || null;
      }
    }

    if (!targetAccount) return "";

    const credStore = await StoreFactory.getStore(this.store.getPathResolver());
    const token = await credStore.get(targetAccount.host, targetAccount.id);

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

    const credStore = await StoreFactory.getStore(this.store.getPathResolver());
    const accountId = `${payload.host.replace(/[^a-zA-Z0-9]/g, "_")}_${payload.username}`;

    await credStore.set(payload.host, accountId, payload.password);
  }

  async handleErase(input: string): Promise<void> {
    const payload = parseGitCredentialInput(input);
    if (!payload.host || !payload.username) return;

    const credStore = await StoreFactory.getStore(this.store.getPathResolver());
    const accountId = `${payload.host.replace(/[^a-zA-Z0-9]/g, "_")}_${payload.username}`;

    await credStore.delete(payload.host, accountId);
  }
}

import { readStdin } from "@/utils/proc";

export async function handleCredentialCommand(action: "get" | "store" | "erase", stdinData?: string) {
  const handler = new GitCredentialHelperHandler();

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
