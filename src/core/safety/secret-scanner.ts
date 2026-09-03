import fs from "node:fs";
import path from "node:path";
import { GitCli } from "../git/git-cli";
import { redactSecret } from "@/utils/security";

export interface DetectedSecret {
  type: string;
  description: string;
  line?: number;
  matchSnippet: string;
}

export interface StagedSecretViolation {
  file: string;
  secrets: DetectedSecret[];
}

export interface RemoteCredentialViolation {
  name: string;
  url: string;
  username?: string;
  tokenOrPassword?: string;
}

const SECRET_PATTERNS: { type: string; description: string; regex: RegExp }[] = [
  {
    type: "private_key",
    description: "Cryptographic Private Key",
    regex: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g,
  },
  {
    type: "github_token",
    description: "GitHub Personal Access Token / OAuth Token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g,
  },
  {
    type: "gitlab_token",
    description: "GitLab Personal/OAuth Access Token",
    regex: /\b(?:glpat|gloas|glptt)-[a-zA-Z0-9_\-]{20,}\b/g,
  },
  {
    type: "slack_token",
    description: "Slack API Token",
    regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/g,
  },
  {
    type: "aws_access_key",
    description: "AWS Access Key ID",
    regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    type: "generic_secret",
    description: "High-Entropy API/Secret Key assignment",
    regex: /(?:api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
  },
];

const DANGEROUS_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pub)?$/i,
  /\.(?:pem|key|pkcs12|pfx)$/i,
  /^(?:vault\.enc|accounts\.json)$/i,
];

export class SecretScanner {
  /**
   * Scans text content for high-risk credentials, private keys, or API tokens.
   */
  scanContent(content: string, filename?: string): DetectedSecret[] {
    const results: DetectedSecret[] = [];
    if (!content) return results;

    const lines = content.split("\n");

    // Line-by-line scanning for standard regexes
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(lineText)) !== null) {
          results.push({
            type: pattern.type,
            description: pattern.description,
            line: i + 1,
            matchSnippet: redactSecret(match[0]),
          });
        }
      }
    }

    // Multiline pattern check (e.g. RSA / OpenSSH Private Keys)
    const privateKeyPattern = /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g;
    let pkMatch: RegExpExecArray | null;
    while ((pkMatch = privateKeyPattern.exec(content)) !== null) {
      // Avoid duplicate line entry if already caught
      if (!results.some((r) => r.type === "private_key")) {
        results.push({
          type: "private_key",
          description: "Cryptographic Private Key Block",
          matchSnippet: redactSecret(pkMatch[0].split("\n")[0]),
        });
      }
    }

    return results;
  }

  /**
   * Checks if a file path is considered a dangerous unencrypted secret file.
   */
  isDangerousFile(filepath: string): boolean {
    const base = path.basename(filepath);
    return DANGEROUS_FILE_PATTERNS.some((pattern) => pattern.test(base));
  }

  /**
   * Scans git staged files in the specified repository.
   */
  async scanStagedFiles(repoPath: string = process.cwd()): Promise<StagedSecretViolation[]> {
    const git = new GitCli(repoPath);
    const root = await git.getRepoRoot();
    if (!root) return [];

    const staged = await git.getStagedFiles();
    const violations: StagedSecretViolation[] = [];

    for (const file of staged) {
      // Allow test files and test suites to define mock tokens/fixtures
      if (/\.(?:test|spec)\.[jt]sx?$/i.test(file) || file.includes("/tests/") || file.startsWith("tests/")) {
        continue;
      }

      const fullPath = path.isAbsolute(file) ? file : path.join(root, file);

      // Check dangerous filename
      if (this.isDangerousFile(file)) {
        violations.push({
          file,
          secrets: [
            {
              type: "dangerous_file",
              description: `Dangerous sensitive file staged for commit (${path.basename(file)})`,
              matchSnippet: file,
            },
          ],
        });
        continue;
      }

      // Check file content via git show :0:file (staged version)
      const stagedContent = await git.showStagedFile(file);
      if (stagedContent) {
        const detected = this.scanContent(stagedContent, file);
        if (detected.length > 0) {
          violations.push({
            file,
            secrets: detected,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Scans git remote URLs in repository to check for embedded plaintext credentials.
   * e.g. https://fuad:ghp_123456@github.com/repo.git
   */
  async scanRemotes(repoPath: string = process.cwd()): Promise<RemoteCredentialViolation[]> {
    const git = new GitCli(repoPath);
    const root = await git.getRepoRoot();
    if (!root) return [];

    const remotes = await git.getRemotes();
    const violations: RemoteCredentialViolation[] = [];

    for (const remote of remotes) {
      const url = remote.fetchUrl || remote.pushUrl;
      if (!url) continue;

      const credMatch = url.match(/^https?:\/\/([^:@\s]+)(?::([^@\s]+))?@/i);
      if (credMatch) {
        violations.push({
          name: remote.name,
          url,
          username: credMatch[1],
          tokenOrPassword: credMatch[2] || undefined,
        });
      }
    }

    return violations;
  }
}
