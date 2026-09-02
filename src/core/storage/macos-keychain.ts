import type { CredentialStore } from "./credential-store";
import { CredentialStoreError } from "@/utils/errors";
import { execProcess } from "@/utils/proc";

export class MacOSKeychainCredentialStore implements CredentialStore {
  readonly name = "macOS Keychain";

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      const res = await execProcess("which", ["security"], { allowFailure: true });
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  async set(service: string, account: string, secret: string): Promise<void> {
    try {
      // First delete existing if any (-U updates or adds)
      await this.delete(service, account);

      await execProcess("security", [
        "add-generic-password",
        "-a",
        account,
        "-s",
        service,
        "-w",
        secret,
        "-U",
      ]);
    } catch (err: unknown) {
      throw new CredentialStoreError(
        `Failed to store credential in macOS Keychain: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    try {
      const res = await execProcess(
        "security",
        ["find-generic-password", "-a", account, "-s", service, "-w"],
        { allowFailure: true }
      );

      if (res.exitCode === 0 && res.stdout.trim().length > 0) {
        return res.stdout.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  async delete(service: string, account: string): Promise<void> {
    try {
      await execProcess(
        "security",
        ["delete-generic-password", "-a", account, "-s", service],
        { allowFailure: true }
      );
    } catch {
      // ignore
    }
  }
}
