import type { CredentialStore } from "./credential-store";
import { LinuxKeyringCredentialStore } from "./linux-keyring";
import { MacOSKeychainCredentialStore } from "./macos-keychain";
import { WindowsCredentialStore } from "./windows-cred";
import { EncryptedVaultCredentialStore } from "./encrypted-vault";
import { PathResolver, defaultPathResolver } from "../config/path-resolver";

export class CompositeCredentialStore implements CredentialStore {
  readonly name: string;
  private primary: CredentialStore;
  private fallback: EncryptedVaultCredentialStore;

  constructor(primary: CredentialStore, fallback: EncryptedVaultCredentialStore) {
    this.primary = primary;
    this.fallback = fallback;
    this.name = `${primary.name} (with Encrypted Vault fallback)`;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async set(service: string, account: string, secret: string): Promise<void> {
    try {
      await this.primary.set(service, account, secret);
    } catch {
      await this.fallback.set(service, account, secret);
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    try {
      const val = await this.primary.get(service, account);
      if (val !== null && val.length > 0) {
        return val;
      }
    } catch {
      // ignore and try fallback
    }
    return this.fallback.get(service, account);
  }

  async delete(service: string, account: string): Promise<void> {
    try {
      await this.primary.delete(service, account);
    } catch {
      // ignore
    }
    await this.fallback.delete(service, account);
  }
}

export class StoreFactory {
  static async getStore(paths: PathResolver = defaultPathResolver, forceEncrypted = false): Promise<CredentialStore> {
    const vault = new EncryptedVaultCredentialStore(paths);

    if (forceEncrypted || process.env.GITBRIDGE_USE_VAULT === "1" || process.env.NODE_ENV === "test") {
      return vault;
    }

    if (process.platform === "darwin") {
      const macStore = new MacOSKeychainCredentialStore();
      if (await macStore.isAvailable()) {
        return new CompositeCredentialStore(macStore, vault);
      }
    } else if (process.platform === "win32") {
      const winStore = new WindowsCredentialStore();
      if (await winStore.isAvailable()) {
        return new CompositeCredentialStore(winStore, vault);
      }
    } else if (process.platform === "linux") {
      const linuxStore = new LinuxKeyringCredentialStore();
      if (await linuxStore.isAvailable()) {
        return new CompositeCredentialStore(linuxStore, vault);
      }
    }

    // Universal fallback
    return vault;
  }
}
