import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SecretScanner } from "@/core/safety/secret-scanner";
import { GitCli } from "@/core/git/git-cli";

describe("SecretScanner Unit Tests", () => {
  const scanner = new SecretScanner();
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gb-scanner-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects various token types and secrets in content", () => {
    // 1. Private Key
    const rsaKey = `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0mockKeyDataHere\n-----END RSA PRIVATE KEY-----`;
    const pkMatches = scanner.scanContent(rsaKey);
    expect(pkMatches.some((m) => m.type === "private_key")).toBe(true);

    // 2. GitHub Token
    const ghText = `const token = "${["ghp", "1234567890abcdefghijklmnopqrstuvwxyz1234"].join("_")}";`;
    const ghMatches = scanner.scanContent(ghText);
    expect(ghMatches.some((m) => m.type === "github_token")).toBe(true);

    // 3. GitLab Token
    const glText = ["glpat", "abcdefghijklmnopqrstuvwxyz1234567890"].join("-");
    const glMatches = scanner.scanContent(glText);
    expect(glMatches.some((m) => m.type === "gitlab_token")).toBe(true);

    // 4. Slack Token
    const slackText = ["xoxb", "1234567890", "abcdefghijklmnop"].join("-");
    const slackMatches = scanner.scanContent(slackText);
    expect(slackMatches.some((m) => m.type === "slack_token")).toBe(true);

    // 5. AWS Access Key
    const awsText = `export AWS_ACCESS_KEY_ID=${["AKIA", "IOSFODNN7EXAMPLE"].join("")}`;
    const awsMatches = scanner.scanContent(awsText);
    expect(awsMatches.some((m) => m.type === "aws_access_key")).toBe(true);

    // 6. Generic Secret
    const genericText = `api_key = "abcdefghijklmnopqrstuvwxyz12345"`;
    const genericMatches = scanner.scanContent(genericText);
    expect(genericMatches.some((m) => m.type === "generic_secret")).toBe(true);
  });

  it("identifies dangerous filenames", () => {
    expect(scanner.isDangerousFile(".env")).toBe(true);
    expect(scanner.isDangerousFile(".env.local")).toBe(true);
    expect(scanner.isDangerousFile("id_rsa")).toBe(true);
    expect(scanner.isDangerousFile("id_ed25519.pub")).toBe(true);
    expect(scanner.isDangerousFile("cert.pem")).toBe(true);
    expect(scanner.isDangerousFile("secret.key")).toBe(true);
    expect(scanner.isDangerousFile("vault.enc")).toBe(true);
    expect(scanner.isDangerousFile("accounts.json")).toBe(true);

    expect(scanner.isDangerousFile("index.ts")).toBe(false);
    expect(scanner.isDangerousFile("README.md")).toBe(false);
  });

  it("scans git staged files and detects violations", async () => {
    const git = new GitCli(tempDir);
    await git.exec(["init"]);
    await git.exec(["config", "user.name", "Tester"]);
    await git.exec(["config", "user.email", "tester@test.com"]);

    // Stage a dangerous .env file
    const envPath = path.join(tempDir, ".env");
    fs.writeFileSync(envPath, "SECRET_KEY=1234567890abcdefghijklmnopqrstuvwxyz\n");
    await git.exec(["add", ".env"]);

    const stagedViolations = await scanner.scanStagedFiles(tempDir);
    expect(stagedViolations.length).toBeGreaterThanOrEqual(1);
    expect(stagedViolations.some((v) => v.file === ".env")).toBe(true);
  });

  it("scans git remotes and catches embedded credentials", async () => {
    const git = new GitCli(tempDir);
    await git.exec(["init"]);
    await git.exec(["config", "user.name", "Tester"]);
    await git.exec(["config", "user.email", "tester@test.com"]);

    const fakePat = ["ghp", "secretToken1234567890abcdef1234"].join("_");
    await git.exec(["remote", "add", "origin", `https://fuad:${fakePat}@github.com/my/repo.git`]);

    const remoteViolations = await scanner.scanRemotes(tempDir);
    expect(remoteViolations.length).toBe(1);
    expect(remoteViolations[0].name).toBe("origin");
    expect(remoteViolations[0].username).toBe("fuad");
    expect(remoteViolations[0].tokenOrPassword).toBe(fakePat);
  });
});
