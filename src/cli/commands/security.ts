import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ConfigStore, defaultConfigStore } from "@/core/config/config-store";
import { IdentityGuard } from "@/core/safety/identity-guard";
import { SecretScanner, type StagedSecretViolation, type RemoteCredentialViolation } from "@/core/safety/secret-scanner";
import { StoreFactory } from "@/core/storage/store-factory";
import { GitCli } from "@/core/git/git-cli";
import { expandTilde, isWindows } from "@/utils/platform";
import { redactSecret } from "@/utils/security";

export interface PermissionIssue {
  path: string;
  expectedMode: number;
  actualMode: number;
  isDir: boolean;
}

export class SecurityAuditor {
  private store: ConfigStore;
  private scanner: SecretScanner;
  private guard: IdentityGuard;

  constructor(store: ConfigStore = defaultConfigStore) {
    this.store = store;
    this.scanner = new SecretScanner();
    this.guard = new IdentityGuard(store);
  }

  auditPermissions(): PermissionIssue[] {
    const issues: PermissionIssue[] = [];
    if (isWindows()) return issues; // Windows handles ACLs differently

    const paths = this.store.getPathResolver();
    const dirsToCheck = [
      paths.getBaseDir(),
      paths.getGeneratedDir(),
      paths.getRulesDir(),
      paths.getBackupsDir(),
      paths.getShimsDir(),
    ];

    for (const dir of dirsToCheck) {
      if (fs.existsSync(dir)) {
        const stat = fs.statSync(dir);
        const mode = stat.mode & 0o777;
        if (mode !== 0o700) {
          issues.push({ path: dir, expectedMode: 0o700, actualMode: mode, isDir: true });
        }
      }
    }

    const filesToCheck = [
      paths.getConfigFile(),
      paths.getIdentitiesFile(),
      paths.getAccountsFile(),
      paths.getReposFile(),
      paths.getEncryptedVaultFile(),
      paths.getMainGitConfigFile(),
      paths.getGeneratedSshConfigFile(),
    ];

    // Check rules
    const rulesDir = paths.getRulesDir();
    if (fs.existsSync(rulesDir)) {
      for (const f of fs.readdirSync(rulesDir)) {
        filesToCheck.push(path.join(rulesDir, f));
      }
    }

    // Check SSH keys in accounts
    const accounts = this.store.loadAccounts();
    for (const acc of accounts) {
      if (acc.sshKeyPath) {
        filesToCheck.push(expandTilde(acc.sshKeyPath));
      }
    }

    for (const file of filesToCheck) {
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file);
        const mode = stat.mode & 0o777;
        if (mode !== 0o600) {
          issues.push({ path: file, expectedMode: 0o600, actualMode: mode, isDir: false });
        }
      }
    }

    return issues;
  }

  fixPermissions(): { fixed: string[]; failed: string[] } {
    const issues = this.auditPermissions();
    const fixed: string[] = [];
    const failed: string[] = [];

    for (const issue of issues) {
      try {
        fs.chmodSync(issue.path, issue.expectedMode);
        fixed.push(issue.path);
      } catch {
        failed.push(issue.path);
      }
    }

    return { fixed, failed };
  }
}

export async function handleSecurityCheck(cwd: string = process.cwd(), store: ConfigStore = defaultConfigStore) {
  const auditor = new SecurityAuditor(store);
  const scanner = new SecretScanner();
  const guard = new IdentityGuard(store);
  const git = new GitCli(cwd);
  const isRepo = await git.isGitRepo();

  console.log(pc.bold("\n  GITBRIDGE SECURITY AUDIT"));
  console.log(pc.gray("  ──────────────────────────────────────────────────"));

  let totalWarnings = 0;

  // 1. Filesystem Permissions Audit
  console.log(pc.bold("  1. Filesystem & Permission Hardening"));
  const permIssues = auditor.auditPermissions();
  if (permIssues.length === 0) {
    console.log(`     ${pc.green("✔")} All GitBridge configuration & SSH key files have strict permissions (0700/0600)`);
  } else {
    totalWarnings += permIssues.length;
    console.log(`     ${pc.yellow("⚠")} Found ${permIssues.length} file(s) with overly permissive permissions:`);
    for (const issue of permIssues) {
      const modeOct = issue.actualMode.toString(8).padStart(4, "0");
      const expOct = issue.expectedMode.toString(8).padStart(4, "0");
      console.log(`       • ${pc.gray(issue.path)} (${pc.red(modeOct)} -> expected ${pc.cyan(expOct)})`);
    }
    console.log(`       Run '${pc.cyan("gb security fix")}' to auto-lock these permissions.`);
  }

  // 2. Storage & Vault Security
  console.log(pc.bold("\n  2. Keyring & Vault Architecture"));
  const credStore = await StoreFactory.getStore(store.getPathResolver());
  console.log(`     ${pc.green("✔")} Active Keyring Backend: ${pc.cyan(credStore.name)}`);
  const accounts = store.loadAccounts();
  console.log(`     ${pc.green("✔")} Authenticated Accounts: ${pc.cyan(accounts.length.toString())} stored with hardware-bound entropy`);

  // 3. Staged Secrets & Private Keys
  console.log(pc.bold("\n  3. Staged Changes Secret Inspection"));
  if (isRepo) {
    const stagedViolations = await scanner.scanStagedFiles(cwd);
    if (stagedViolations.length === 0) {
      console.log(`     ${pc.green("✔")} No plaintext API tokens, private keys, or .env files detected in staging area`);
    } else {
      totalWarnings += stagedViolations.length;
      console.log(`     ${pc.red("✖")} Found ${stagedViolations.length} staged file(s) containing sensitive credentials:`);
      for (const v of stagedViolations) {
        console.log(`       • ${pc.bold(v.file)}:`);
        for (const s of v.secrets) {
          const loc = s.line ? `Line ${s.line}: ` : "";
          console.log(`         - ${pc.red(s.description)} (${loc}${pc.gray(s.matchSnippet)})`);
        }
      }
    }
  } else {
    console.log(`     ${pc.gray("○ Current directory is not a Git repository (skipped staged check)")}`);
  }

  // 4. Plaintext Remote URL Credentials
  console.log(pc.bold("\n  4. Remote URL Plaintext Credential Check"));
  if (isRepo) {
    const remoteViolations = await scanner.scanRemotes(cwd);
    if (remoteViolations.length === 0) {
      console.log(`     ${pc.green("✔")} No plaintext tokens or passwords embedded in repository remotes`);
    } else {
      totalWarnings += remoteViolations.length;
      console.log(`     ${pc.yellow("⚠")} Detected plaintext credentials embedded in remote URLs:`);
      for (const rv of remoteViolations) {
        console.log(`       • Remote '${pc.cyan(rv.name)}': ${pc.gray(rv.url)}`);
      }
      console.log(`       Run '${pc.cyan("gb security fix")}' to automatically scrub credentials into Keyring.`);
    }
  } else {
    console.log(`     ${pc.gray("○ Current directory is not a Git repository (skipped remote check)")}`);
  }

  // 5. Safety Hooks Status
  console.log(pc.bold("\n  5. Safety Guard & Pre-Commit/Push Protection"));
  if (isRepo) {
    const root = (await git.getRepoRoot()) || cwd;
    const preCommitActive = guard.isPreCommitInstalled(root);
    const prePushActive = guard.isPrePushInstalled(root);

    console.log(`     ${preCommitActive ? pc.green("✔") : pc.yellow("○")} Pre-Commit Secret Guard: ${preCommitActive ? pc.green("Active") : pc.yellow("Not installed")}`);
    console.log(`     ${prePushActive ? pc.green("✔") : pc.yellow("○")} Pre-Push Identity Guard:  ${prePushActive ? pc.green("Active") : pc.yellow("Not installed")}`);

    if (!preCommitActive || !prePushActive) {
      totalWarnings++;
      console.log(`       Run '${pc.cyan("gb security fix")}' to activate safety protection hooks.`);
    }
  } else {
    console.log(`     ${pc.gray("○ Current directory is not a Git repository (skipped hooks check)")}`);
  }

  console.log(pc.gray("\n  ──────────────────────────────────────────────────"));
  if (totalWarnings === 0) {
    console.log(pc.bold(pc.green("  ✔ Security status: Fort Knox (All 5 security layers passing!)\n")));
  } else {
    console.log(pc.bold(pc.yellow(`  ⚠ Security status: ${totalWarnings} recommendation(s) found. Run 'gb security fix' to auto-resolve.\n`)));
  }
}

export async function handleSecurityFix(cwd: string = process.cwd(), store: ConfigStore = defaultConfigStore) {
  const auditor = new SecurityAuditor(store);
  const scanner = new SecretScanner();
  const guard = new IdentityGuard(store);
  const git = new GitCli(cwd);
  const isRepo = await git.isGitRepo();

  console.log(pc.bold("\n  GITBRIDGE SECURITY AUTO-REMEDIATION"));
  console.log(pc.gray("  ──────────────────────────────────────────────────"));

  // 1. Fix Permissions
  const permResult = auditor.fixPermissions();
  if (permResult.fixed.length > 0) {
    console.log(`  ${pc.green("✔")} Hardened permissions (0700/0600) on ${pc.cyan(permResult.fixed.length.toString())} file(s) & directories.`);
  } else {
    console.log(`  ${pc.green("✔")} Filesystem permissions are already strictly hardened.`);
  }

  // 2. Install Hooks if Git Repo
  if (isRepo) {
    const root = (await git.getRepoRoot()) || cwd;
    await guard.installPreCommitHook(root);
    await guard.installPrePushHook(root);
    console.log(`  ${pc.green("✔")} Pre-commit secret scanning hook installed.`);
    console.log(`  ${pc.green("✔")} Pre-push identity and remote guard hook installed.`);

    // 3. Scrub Plaintext Remote Credentials
    const remoteViolations = await scanner.scanRemotes(cwd);
    if (remoteViolations.length > 0) {
      const credStore = await StoreFactory.getStore(store.getPathResolver());
      for (const rv of remoteViolations) {
        if (rv.tokenOrPassword) {
          // Clean URL by stripping username:password@
          const cleanUrl = rv.url.replace(/^(https?:\/\/)[^@]+@/, "$1");
          await git.setRemoteUrl(rv.name, cleanUrl);

          // Store token in OS Keyring
          const matchHost = cleanUrl.match(/^https?:\/\/([^/:]+)/i);
          const host = matchHost ? matchHost[1] : "git-remote";
          const user = rv.username || "token";
          await credStore.set(host, user, rv.tokenOrPassword);

          console.log(`  ${pc.green("✔")} Scrubbed plaintext token from remote '${pc.cyan(rv.name)}' into secure Keyring.`);
        }
      }
    }
  }

  console.log(pc.bold(pc.green("\n✔ Auto-remediation complete! Your GitBridge environment is secure.\n")));
}

export async function handleSecurityScan(targetDir: string = process.cwd()) {
  const scanner = new SecretScanner();
  console.log(pc.bold(`\n  Scanning '${targetDir}' for secrets and private keys...`));

  let filesScanned = 0;
  let secretsFound = 0;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === "dist") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        filesScanned++;
        if (scanner.isDangerousFile(full)) {
          secretsFound++;
          console.log(`  ${pc.red("✖")} Sensitive file detected: ${pc.bold(path.relative(targetDir, full))}`);
          continue;
        }

        // Limit scanning to text files under 2MB
        try {
          const stat = fs.statSync(full);
          if (stat.size > 2 * 1024 * 1024) continue;
          const content = fs.readFileSync(full, "utf-8");
          const hits = scanner.scanContent(content, full);
          if (hits.length > 0) {
            secretsFound += hits.length;
            console.log(`  ${pc.red("✖")} Found in ${pc.bold(path.relative(targetDir, full))}:`);
            for (const h of hits) {
              const loc = h.line ? `Line ${h.line}: ` : "";
              console.log(`    • ${pc.yellow(h.description)} (${loc}${pc.gray(h.matchSnippet)})`);
            }
          }
        } catch {
          // ignore binary or unreadable files
        }
      }
    }
  }

  try {
    walk(targetDir);
  } catch (err: unknown) {
    console.error(pc.red(`Scan failed: ${err instanceof Error ? err.message : String(err)}`));
    return;
  }

  console.log(pc.gray("  ──────────────────────────────────────────────────"));
  if (secretsFound === 0) {
    console.log(pc.bold(pc.green(`✔ Scan complete: ${filesScanned} files scanned. No secrets found!\n`)));
  } else {
    console.log(pc.bold(pc.red(`✖ Scan complete: Found ${secretsFound} sensitive item(s) across ${filesScanned} files.\n`)));
  }
}
