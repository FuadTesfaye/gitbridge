import { describe, expect, it } from "bun:test";
import { SecretScanner } from "@/core/safety/secret-scanner";

describe("SecretScanner", () => {
  const scanner = new SecretScanner();

  it("detects GitHub Personal Access Tokens and OAuth tokens", () => {
    const mockContent = `
      // config.js
      const token = "ghp_1234567890abcdef1234567890abcdef1234";
      const oauth = "gho_abcdef1234567890abcdef1234567890abcdef";
    `;

    const results = scanner.scanContent(mockContent, "config.js");
    expect(results.length).toBe(2);
    expect(results[0].type).toBe("github_token");
    expect(results[0].line).toBe(3);
    expect(results[0].matchSnippet).toContain("ghp_123");
    expect(results[1].type).toBe("github_token");
    expect(results[1].line).toBe(4);
  });

  it("detects GitLab Personal and OAuth access tokens", () => {
    const mockContent = `
      GITLAB_TOKEN=glpat-abcdef1234567890_xyz123
    `;

    const results = scanner.scanContent(mockContent, ".env.sample");
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("gitlab_token");
    expect(results[0].matchSnippet).toContain("glpat-a");
  });

  it("detects cryptographic private key blocks", () => {
    const mockKey = `
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACDH1W1dMockDataForSecurityTestingPurposeOnly1234567890==
-----END OPENSSH PRIVATE KEY-----
    `;

    const results = scanner.scanContent(mockKey, "id_test");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.type === "private_key")).toBe(true);
  });

  it("detects AWS access keys and Slack tokens", () => {
    const mockContent = `
      AWS_KEY = "AKIA1234567890ABCDEF"
      SLACK_WEBHOOK = "xoxb-1234567890-1234567890123-abcdef123456"
    `;

    const results = scanner.scanContent(mockContent);
    expect(results.some((r) => r.type === "aws_access_key")).toBe(true);
    expect(results.some((r) => r.type === "slack_token")).toBe(true);
  });

  it("identifies dangerous filenames", () => {
    expect(scanner.isDangerousFile(".env")).toBe(true);
    expect(scanner.isDangerousFile(".env.local")).toBe(true);
    expect(scanner.isDangerousFile(".env.production")).toBe(true);
    expect(scanner.isDangerousFile("id_rsa")).toBe(true);
    expect(scanner.isDangerousFile("id_ed25519")).toBe(true);
    expect(scanner.isDangerousFile("server.pem")).toBe(true);
    expect(scanner.isDangerousFile("private.key")).toBe(true);
    expect(scanner.isDangerousFile("vault.enc")).toBe(true);
    expect(scanner.isDangerousFile("accounts.json")).toBe(true);

    // Safe files
    expect(scanner.isDangerousFile("README.md")).toBe(false);
    expect(scanner.isDangerousFile("package.json")).toBe(false);
    expect(scanner.isDangerousFile("src/index.ts")).toBe(false);
  });

  it("does not report false positives on normal source code", () => {
    const safeContent = `
      import fs from "node:fs";
      import path from "node:path";

      export function getApiKey(): string {
        return process.env.MY_API_KEY || "";
      }
    `;

    const results = scanner.scanContent(safeContent, "src/api.ts");
    expect(results.length).toBe(0);
  });
});
