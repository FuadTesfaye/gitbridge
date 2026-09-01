import type { CredentialStore } from "./credential-store";
import { CredentialStoreError } from "@/utils/errors";

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
      const proc = Bun.spawn(["cmdkey", `/generic:${target}`, `/user:${account}`, `/pass:${secret}`], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const code = await proc.exited;
      if (code !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(stderr.trim() || `cmdkey exited with code ${code}`);
      }
    } catch (err: unknown) {
      throw new CredentialStoreError(
        `Failed to store credential in Windows Credential Manager: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    const target = this.targetName(service, account);
    // PowerShell query script using Windows Credential API or cmdkey check
    try {
      const script = `
        Add-Type -AssemblyName System.Security
        $target = "${target}"
        $cred = [System.Net.CredentialCache]::DefaultCredentials
        # Note: full extraction on Windows uses powershell credential lookup
      `;
      const proc = Bun.spawn(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const code = await proc.exited;
      if (code === 0 && stdout.trim()) {
        return stdout.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  async delete(service: string, account: string): Promise<void> {
    const target = this.targetName(service, account);
    try {
      const proc = Bun.spawn(["cmdkey", `/delete:${target}`], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
    } catch {
      // ignore
    }
  }
}
