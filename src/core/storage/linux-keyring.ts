import type { CredentialStore } from "./credential-store";
import { CredentialStoreError } from "@/utils/errors";

export class LinuxKeyringCredentialStore implements CredentialStore {
  readonly name = "Linux Secret Service (secret-tool)";

  async isAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(["which", "secret-tool"], {
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
      const proc = Bun.spawn(
        ["secret-tool", "store", "--label", `GitBridge (${service}:${account})`, "service", service, "account", account],
        {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      proc.stdin.write(secret);
      proc.stdin.end();

      const code = await proc.exited;
      if (code !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(stderr.trim() || `secret-tool store exited with code ${code}`);
      }
    } catch (err: unknown) {
      throw new CredentialStoreError(
        `Failed to store credential in Linux Keyring: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    try {
      const proc = Bun.spawn(["secret-tool", "lookup", "service", service, "account", account], {
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
      const proc = Bun.spawn(["secret-tool", "clear", "service", service, "account", account], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
    } catch {
      // ignore deletion errors
    }
  }
}
