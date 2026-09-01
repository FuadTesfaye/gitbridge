import type { CredentialStore } from "./credential-store";
import { CredentialStoreError } from "@/utils/errors";

export class MacOSKeychainCredentialStore implements CredentialStore {
  readonly name = "macOS Keychain";

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      const proc = Bun.spawn(["which", "security"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      return code === 0;
    } catch {
      return false;
    }
  }

  async set(service: string, account: string, secret: string): Promise<void> {
    try {
      // First delete existing if any (-U updates or adds)
      await this.delete(service, account);

      const proc = Bun.spawn(
        ["security", "add-generic-password", "-a", account, "-s", service, "-w", secret, "-U"],
        {
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      const code = await proc.exited;
      if (code !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(stderr.trim() || `security add-generic-password exited with code ${code}`);
      }
    } catch (err: unknown) {
      throw new CredentialStoreError(
        `Failed to store credential in macOS Keychain: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    try {
      const proc = Bun.spawn(["security", "find-generic-password", "-a", account, "-s", service, "-w"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const code = await proc.exited;

      if (code === 0 && stdout.trim().length > 0) {
        return stdout.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  async delete(service: string, account: string): Promise<void> {
    try {
      const proc = Bun.spawn(["security", "delete-generic-password", "-a", account, "-s", service], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
    } catch {
      // ignore
    }
  }
}
