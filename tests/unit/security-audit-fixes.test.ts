import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { redactSecret, sanitizeConfigString, sanitizeSshKeyPath } from "@/utils/security";
import { GitConfigGenerator } from "@/core/git/config-generator";
import { ConfigStore } from "@/core/config/config-store";
import { PathResolver } from "@/core/config/path-resolver";
import { IdentityResolver } from "@/core/identity/identity-resolver";
import { SecretScanner } from "@/core/safety/secret-scanner";
import { GitCli } from "@/core/git/git-cli";
import { handleSecurityFix } from "@/cli/commands/security";
import { GitCredentialHelperHandler } from "@/cli/commands/credential";

describe("Security Audit Hardening Tests", () => {
  let tempDir: string;
  let store: ConfigStore;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gb-sec-fix-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const paths = new PathResolver(tempDir);
    store = new ConfigStore(paths);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Secret Redaction Guarantees", () => {
    it("never exposes overlapping characters for medium/short tokens", () => {
      // 9-character secret: must not expose full secret
      expect(redactSecret("123456789")).toBe("********");
      expect(redactSecret("abcdefghijk")).toBe("********"); // 11 chars
      expect(redactSecret("123456789012345")).toBe("********"); // 15 chars
    });

    it("masks safely for long API tokens", () => {
      const ghp = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";
      const redacted = redactSecret(ghp);
      expect(redacted).toBe("ghp_123...wxyz");
      expect(redacted).not.toContain("abcdefghijklmnopqrstuv");
    });
  });

  describe("CRLF & Directive Injection Prevention", () => {
    it("neutralizes CRLF in Git config generation", () => {
      // Register an identity with malicious CRLF attempting core.sshCommand injection
      store.addIdentity({
        id: "evil_id",
        name: "Attacker\n[core]\n    sshCommand = /tmp/evil.sh\n",
        email: "evil@example.com",
        signingKey: "ssh-ed25519 AAAAC3...\n[core]\n    editor = vim",
        isDefault: true,
      });

      store.addRule({
        id: "rule_exploit\n[core]\n    logAllRefUpdates = true",
        path: "~/malicious\n[core]\n    autocrlf = true",
        identityId: "evil_id",
      });

      const generator = new GitConfigGenerator(store);
      const { mainConfigPath, generatedRules } = generator.generate();

      const mainContent = fs.readFileSync(mainConfigPath, "utf-8");
      // Must not contain injected section headers or new directives
      expect(mainContent).not.toMatch(/^\s*\[core\]/m);
      expect(mainContent).not.toMatch(/^\s*sshCommand\s*=/m);

      const ruleContent = fs.readFileSync(generatedRules[0], "utf-8");
      expect(ruleContent).not.toMatch(/^\s*\[core\]/m);
      expect(ruleContent).not.toMatch(/^\s*sshCommand\s*=/m);
      expect(ruleContent).not.toMatch(/^\s*checkStat\s*=/m);
    });

    it("sanitizes SSH key paths against shell injection characters", () => {
      expect(sanitizeSshKeyPath('/home/user/.ssh/id_ed25519" && id && "')).toBe("/home/user/.ssh/id_ed25519  id  ");
      expect(sanitizeSshKeyPath("~/.ssh/key`whoami`$HOME")).toBe("~/.ssh/keywhoamiHOME");
      expect(sanitizeSshKeyPath("/home/user/.ssh/id_rsa; rm -rf /")).toBe("/home/user/.ssh/id_rsa rm -rf /");
      expect(sanitizeSshKeyPath("/normal/path/.ssh/id_ed25519")).toBe("/normal/path/.ssh/id_ed25519");
    });
  });

  describe("Untrusted Working Tree Configuration Isolation", () => {
    it("ignores committed .gitbridge.json in working tree root", async () => {
      const mockRepoDir = path.join(tempDir, "cloned-repo");
      fs.mkdirSync(path.join(mockRepoDir, ".git"), { recursive: true });

      // Add user identities to GitBridge
      store.addIdentity({
        id: "corporate",
        name: "Corporate Developer",
        email: "corp@bigco.com",
      });
      store.addIdentity({
        id: "personal",
        name: "Personal Dev",
        email: "personal@dev.org",
        isDefault: true,
      });

      // Malicious repo author commits .gitbridge.json at root trying to hijack identity to corporate
      fs.writeFileSync(
        path.join(mockRepoDir, ".gitbridge.json"),
        JSON.stringify({ identityId: "corporate" }),
        "utf-8"
      );

      const resolver = new IdentityResolver(store);
      const ctx = await resolver.resolve(mockRepoDir);

      // Must NOT adopt corporate identity from untrusted working tree root file
      expect(ctx.identity?.id).not.toBe("corporate");
      expect(ctx.identity?.id).toBe("personal"); // falls back to default

      // But internal .git/gitbridge.json IS honored
      fs.writeFileSync(
        path.join(mockRepoDir, ".git", "gitbridge.json"),
        JSON.stringify({ identityId: "corporate" }),
        "utf-8"
      );

      const ctxInternal = await resolver.resolve(mockRepoDir);
      expect(ctxInternal.identity?.id).toBe("corporate");
    });
  });

  describe("Scrubbed remote credentials stay usable", () => {
    it("registers an account so the credential helper can hand the scrubbed token back to git", async () => {
      const repo = path.join(tempDir, "scrub-repo");
      fs.mkdirSync(repo, { recursive: true });
      const git = new GitCli(repo);
      await git.exec(["init"]);
      await git.exec(["config", "user.name", "Scrub Tester"]);
      await git.exec(["config", "user.email", "scrub@example.com"]);
      const token = "ghp_FAKEscrubbedTokenForTests000000000";
      await git.exec(["remote", "add", "origin", `https://alice:${token}@github.com/alice/repo.git`]);

      store.setEnabled(true);
      await handleSecurityFix(repo, store);

      // The remote no longer carries credentials
      const remotes = await git.getRemotes();
      expect(remotes[0].fetchUrl).toBe("https://github.com/alice/repo.git");

      // An account now exists for the host and user found in the URL
      const account = store.loadAccounts().find((a) => a.host === "github.com" && a.username === "alice");
      expect(account).toBeDefined();
      expect(account?.providerId).toBe("github");
      expect(account?.authType).toBe("pat");

      // So git's credential request for that host is answered with the scrubbed token
      const helper = new GitCredentialHelperHandler(store);
      const output = await helper.handleGet("protocol=https\nhost=github.com\nusername=alice\n", repo);
      expect(output).toContain("username=alice");
      expect(output).toContain(`password=${token}`);
    });

    it("reuses an existing account for the same host and user instead of duplicating it", async () => {
      const repo = path.join(tempDir, "scrub-repo-2");
      fs.mkdirSync(repo, { recursive: true });
      const git = new GitCli(repo);
      await git.exec(["init"]);
      await git.exec(["remote", "add", "origin", "https://bob:s3cret@gitlab.example.com/group/repo.git"]);

      store.addAccount({
        id: "gitlab_bob",
        providerId: "gitlab",
        host: "gitlab.example.com",
        username: "bob",
        authType: "pat",
      });

      await handleSecurityFix(repo, store);

      const accounts = store.loadAccounts().filter((a) => a.username === "bob");
      expect(accounts.length).toBe(1);
      expect(accounts[0].id).toBe("gitlab_bob");

      const helper = new GitCredentialHelperHandler(store);
      store.setEnabled(true);
      const output = await helper.handleGet("protocol=https\nhost=gitlab.example.com\nusername=bob\n", repo);
      expect(output).toContain("password=s3cret");
    });
  });

  describe("Expanded Secret Scanner Patterns", () => {
    it("detects modern GitHub fine-grained PATs", () => {
      const scanner = new SecretScanner();
      const fineGrainedPat = "github_pat_11AABCDEF01234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789012";
      const detected = scanner.scanContent(`const token = "${fineGrainedPat}";`);
      expect(detected.some((d) => d.type === "github_fine_grained_pat")).toBe(true);
    });

    it("detects OpenAI and Anthropic API keys", () => {
      const scanner = new SecretScanner();
      const openAiKey = "sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx";
      const anthropicKey = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456789";

      const detected = scanner.scanContent(`
        const oai = "${openAiKey}";
        const claude = "${anthropicKey}";
      `);

      expect(detected.some((d) => d.type === "openai_key")).toBe(true);
      expect(detected.some((d) => d.type === "anthropic_key")).toBe(true);
    });
  });
});
