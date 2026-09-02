import type { CredentialStore } from "./credential-store";
import { CredentialStoreError } from "@/utils/errors";
import { execProcess } from "@/utils/proc";

export class LinuxKeyringCredentialStore implements CredentialStore {
  readonly name = "Linux Secret Service (secret-tool)";

  async isAvailable(): Promise<boolean> {
    try {
      const res = await execProcess("which", ["secret-tool"], { allowFailure: true });
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  async set(service: string, account: string, secret: string): Promise<void> {
    try {
      await execProcess(
        "secret-tool",
        ["store", "--label", `GitBridge (${service}:${account})`, "service", service, "account", account],
        { stdin: secret }
      );
    } catch (err: unknown) {
      throw new CredentialStoreError(
        `Failed to store credential in Linux Keyring: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    try {
      const res = await execProcess(
        "secret-tool",
        ["lookup", "service", service, "account", account],
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
        "secret-tool",
        ["clear", "service", service, "account", account],
        { allowFailure: true }
      );
    } catch {
      // ignore deletion errors
    }
  }
}
