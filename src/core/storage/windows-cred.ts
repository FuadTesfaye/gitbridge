import type { CredentialStore } from "./credential-store";
import { CredentialStoreError } from "@/utils/errors";
import { execProcess } from "@/utils/proc";

export class WindowsCredentialStore implements CredentialStore {
  readonly name = "Windows Credential Manager";

  async isAvailable(): Promise<boolean> {
    return process.platform === "win32";
  }

  private targetName(service: string, account: string): string {
    return `gitbridge:${service}:${account}`;
  }

  async set(service: string, account: string, secret: string): Promise<void> {
    const target = this.targetName(service, account);
    try {
      await execProcess("cmdkey", [`/generic:${target}`, `/user:${account}`, `/pass:${secret}`]);
    } catch (err: unknown) {
      throw new CredentialStoreError(
        `Failed to store credential in Windows Credential Manager: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    const target = this.targetName(service, account);
    try {
      const script = `
        Add-Type -AssemblyName System.Security
        $target = "${target}"
        $cred = [System.Net.CredentialCache]::DefaultCredentials
      `;
      const res = await execProcess(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { allowFailure: true }
      );

      if (res.exitCode === 0 && res.stdout.trim()) {
        return res.stdout.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  async delete(service: string, account: string): Promise<void> {
    const target = this.targetName(service, account);
    try {
      await execProcess("cmdkey", [`/delete:${target}`], { allowFailure: true });
    } catch {
      // ignore
    }
  }
}
