export interface CredentialStore {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  set(service: string, account: string, secret: string): Promise<void>;
  get(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<void>;
}
