import fs from "node:fs";
import path from "node:path";
import { getHomeDir, collapseTilde } from "@/utils/platform";

export interface SshKeyInfo {
  name: string;
  privateKeyPath: string;
  publicKeyPath: string;
  type: string;
  comment?: string;
}

export class SshKeyDetector {
  static listAvailableKeys(sshDir?: string): SshKeyInfo[] {
    const targetDir = sshDir || path.join(getHomeDir(), ".ssh");
    if (!fs.existsSync(targetDir)) {
      return [];
    }

    const files = fs.readdirSync(targetDir);
    const pubFiles = files.filter((f) => f.endsWith(".pub"));
    const keys: SshKeyInfo[] = [];

    for (const pub of pubFiles) {
      const pubPath = path.join(targetDir, pub);
      const privName = pub.slice(0, -4);
      const privPath = path.join(targetDir, privName);

      try {
        const content = fs.readFileSync(pubPath, "utf-8").trim();
        const parts = content.split(/\s+/);
        const type = parts[0] || "unknown";
        const comment = parts.length > 2 ? parts.slice(2).join(" ") : undefined;

        keys.push({
          name: privName,
          privateKeyPath: collapseTilde(privPath),
          publicKeyPath: collapseTilde(pubPath),
          type,
          comment,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return keys;
  }
}
