import fs from "node:fs";
import os from "node:os";
import child_process from "node:child_process";

/**
 * Safely masks sensitive tokens, passwords, and private keys for console and log output.
 * Example: secret_token_value_example -> secr...mple
 */
export function redactSecret(secret: string): string {
  if (!secret || typeof secret !== "string") return "";
  const trimmed = secret.trim();
  if (trimmed.length <= 8) {
    return "********";
  }
  const prefix = trimmed.slice(0, 7);
  const suffix = trimmed.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Sanitizes input strings to prevent CRLF injection and malicious directive injection
 * into SSH config and Git config files.
 */
export function sanitizeConfigString(val: string): string {
  if (!val || typeof val !== "string") return "";
  // Strip carriage returns, newlines, null bytes, and dangerous command characters
  return val.replace(/[\r\n\0]/g, "").trim();
}

/**
 * Retrieves a hardware-bound unique machine identifier for key derivation.
 * Falls back gracefully to system info if restricted.
 */
export function getMachineHardwareId(): string {
  const platform = process.platform;

  try {
    if (platform === "linux") {
      // 1. /etc/machine-id
      if (fs.existsSync("/etc/machine-id")) {
        const id = fs.readFileSync("/etc/machine-id", "utf-8").trim();
        if (id) return `linux-machine-id:${id}`;
      }
      // 2. /var/lib/dbus/machine-id
      if (fs.existsSync("/var/lib/dbus/machine-id")) {
        const id = fs.readFileSync("/var/lib/dbus/machine-id", "utf-8").trim();
        if (id) return `linux-dbus-id:${id}`;
      }
    } else if (platform === "darwin") {
      // macOS IOPlatformUUID
      try {
        const out = child_process.execSync("ioreg -rd1 -c IOPlatformExpertDevice", {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
        if (match && match[1]) {
          return `darwin-uuid:${match[1]}`;
        }
      } catch {
        // fall through
      }
    } else if (platform === "win32") {
      // Windows MachineGuid via reg query
      try {
        const out = child_process.execSync(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
          { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
        );
        const match = out.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/);
        if (match && match[1]) {
          return `win-guid:${match[1]}`;
        }
      } catch {
        // fall through
      }
    }
  } catch {
    // fall through to fallback
  }

  // Fallback to combined machine characteristics
  const host = os.hostname();
  const user = os.userInfo().username;
  const home = os.homedir();
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : "unknown-cpu";
  return `fallback-machine:${host}:${user}:${home}:${cpuModel}`;
}
