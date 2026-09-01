import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import type { CredentialStore } from "./credential-store";
import { PathResolver, defaultPathResolver } from "../config/path-resolver";
import { CredentialStoreError } from "@/utils/errors";

export class EncryptedVaultCredentialStore implements CredentialStore {
  readonly name = "Encrypted Vault (AES-256-GCM)";
  private paths: PathResolver;

  constructor(paths: PathResolver = defaultPathResolver) {
    this.paths = paths;
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available as local fallback
  }

  private deriveKey(salt: Buffer): Buffer {
    // Generate deterministic machine+user seed
    const seed = `${os.hostname()}:${os.userInfo().username}:${this.paths.getBaseDir()}:gitbridge-v1`;
    return crypto.pbkdf2Sync(seed, salt, 100000, 32, "sha256");
  }

  private readVault(): Record<string, string> {
    const file = this.paths.getEncryptedVaultFile();
    if (!fs.existsSync(file)) {
      return {};
    }

    try {
      const raw = fs.readFileSync(file);
      if (raw.length < 16 + 12 + 16) {
        return {};
      }

      // Format: [16 bytes salt][12 bytes IV][16 bytes AuthTag][Ciphertext]
      const salt = raw.subarray(0, 16);
      const iv = raw.subarray(16, 28);
      const tag = raw.subarray(28, 44);
      const ciphertext = raw.subarray(44);

      const key = this.deriveKey(salt);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(decrypted.toString("utf-8"));
    } catch (err: unknown) {
      throw new CredentialStoreError(
        `Failed to decrypt GitBridge vault: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private writeVault(data: Record<string, string>): void {
    const file = this.paths.getEncryptedVaultFile();
    try {
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(12);
      const key = this.deriveKey(salt);

      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const plaintext = Buffer.from(JSON.stringify(data), "utf-8");
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();

      // Combine: [salt][iv][tag][ciphertext]
      const payload = Buffer.concat([salt, iv, tag, ciphertext]);

      const tempFile = `${file}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, payload, { mode: 0o600 });
      fs.renameSync(tempFile, file);
    } catch (err: unknown) {
      throw new CredentialStoreError(
        `Failed to write encrypted vault: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private makeKey(service: string, account: string): string {
    return `${service}:::${account}`;
  }

  async set(service: string, account: string, secret: string): Promise<void> {
    const vault = this.readVault();
    vault[this.makeKey(service, account)] = secret;
    this.writeVault(vault);
  }

  async get(service: string, account: string): Promise<string | null> {
    const vault = this.readVault();
    return vault[this.makeKey(service, account)] ?? null;
  }

  async delete(service: string, account: string): Promise<void> {
    const vault = this.readVault();
    delete vault[this.makeKey(service, account)];
    this.writeVault(vault);
  }
}
