/** Where a secret ended up after a write. */
export interface CredentialWriteResult {
  /** Human-readable backend name, e.g. "macOS Keychain" or "Encrypted Vault (AES-256-GCM)". */
  backend: string;
  /** True when the OS keyring failed and the encrypted vault file was used instead. */
  usedFallback: boolean;
  /** The keyring error that caused the fallback, when usedFallback is true. */
  fallbackReason?: string;
}

export interface CredentialStore {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  set(service: string, account: string, secret: string): Promise<CredentialWriteResult>;
  get(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<void>;
}
