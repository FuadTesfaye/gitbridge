---
name: gitbridge
description: >-
  Manage Git identities, multi-account routing, SSH host aliases, directory rules, credential helpers, native git overrides, security auditing, and IDE sync in GitBridge. Use when the user asks to configure or troubleshoot Git identities, multiple GitHub/GitLab accounts, SSH keys, repository commit author profiles, pre-commit guards, or develop/test the GitBridge codebase and companion extension.
---

# GitBridge Universal AI Skill & Operational Runbook

Welcome to **GitBridge**! This skill provides complete operational runbooks, user intent translation tables, and step-by-step procedures for AI assistants (**Claude, Gemini, OpenAI / Codex, DeepSeek, Qwen, Kimi, Cursor, Copilot, Antigravity**) to understand and execute any user request accurately.

---

## 1. Quick Natural Language Intent Translation Table

When a user asks in plain English (or any language) to perform an action, run the corresponding command:

| User Natural Language Request | Exact GitBridge Command | Description |
|---|---|---|
| *"Install GitBridge on Linux or macOS"* | `curl -fsSL https://raw.githubusercontent.com/FuadTesfaye/gitbridge/main/install.sh \| bash` | Universal 1-line installation script |
| *"Install GitBridge on Windows"* | `irm https://raw.githubusercontent.com/FuadTesfaye/gitbridge/main/install.ps1 \| iex` | Native Windows PowerShell installer |
| *"Set this repository to use my work email / identity and remember it"* | `gb repo set . -i <identityId>` | Permanently locks the repo to that identity without asking again |
| *"Set this repo to use GitLab and my company email"* | `gb repo set . -i <id> -p gitlab -a <accountId>` | Binds repo to provider, account, and identity |
| *"What identity/account is this repo using?"* | `gb context` (`gb ctx`) | Displays complete context breakdown |
| *"Why did my commit use this email?"* | `gb explain` | Decision tree analysis across all 5 resolution tiers |
| *"Who am I currently committing as?"* | `gb current` (`gb cur`) | Prints active author name & email |
| *"Switch my identity in this repo to personal"* | `gb switch personal` | Updates local `.git/gitbridge.json` and git config |
| *"Show all configured identities"* | `gb identity list` (`gb id ls`) | Lists identities with names, emails, keys |
| *"Add a new identity"* | `gb identity add --id <id> --name "<name>" --email "<email>"` | Registers new commit author identity |
| *"Edit an identity"* | `gb identity edit <id> [--name <n>] [--email <e>]` | Edits an existing identity |
| *"Connect / log in to my GitHub account"* | `gb auth login github -t <pat> --ssh-key ~/.ssh/id_ed25519` | Validates & secures token in OS keyring |
| *"Connect / log in to my GitLab account"* | `gb auth login gitlab -u <user> -p <pass> --host <url>` | Logs in to public or self-hosted GitLab |
| *"List authenticated provider accounts"* | `gb account list` (`gb acc ls`) | Shows connected accounts across providers |
| *"Map an entire directory tree to an identity"* | `gb rules add <folderPath> <identityId>` | Compiles Git `[includeIf "gitdir:..."]` rule |
| *"List directory rules"* | `gb rules list` (`gb rules ls`) | Shows all path-to-identity mappings |
| *"List remembered repositories"* | `gb repo list` (`gb repo ls`) | Lists all pinned repositories |
| *"Run a security check / audit"* | `gb security check` (`gb sec check`) | Audits permissions, keyrings, remotes, staged secrets |
| *"Fix my security permissions and install hooks"* | `gb security fix` (`gb sec fix`) | Auto-locks permissions to 0700/0600 & installs hooks |
| *"Scan this project for leaked secrets"* | `gb security scan [path]` | Deep scans for API tokens, private keys, `.env` files |
| *"Clone a repo with correct account & identity"* | `gb clone <url>` | Auto-detects provider, matches account, sets identity |
| *"Run system diagnostics and connectivity tests"* | `gb doctor` (`gb doc`) | Inspects Git CLI, SSH keys, and provider APIs |
| *"Enable native Git integration"* | `gb enable` | Injects managed blocks into `~/.gitconfig` and `~/.ssh/config` |
| *"Route native `git` commands through GitBridge"* | `gb override enable` | Installs shims and shell PATH integration |
| *"Sync with VS Code, Cursor, or Antigravity"* | `gb ide sync` | Updates `git.path` in editor settings |

---

## 2. Core Architecture & Mental Model

GitBridge strictly decouples Git management into three independent layers:
```text
                GITBRIDGE
                    │
       ┌────────────┼────────────┐
       │            │            │
       ▼            ▼            ▼
   IDENTITY      ACCOUNT      PROVIDER
     WHO AM I?   WHICH        WHERE AM I
                 ACCOUNT?     HOSTING CODE?
   (Name, Email, (Username,   (GitHub, GitLab,
   Signing Key)  Keychain)    Bitbucket, Self-Hosted)
```

- **Identity**: Git author name, email, commit signing key.
- **Account**: Authenticated user session with token/password stored in OS Keyring.
- **Provider**: Hosting platform (GitHub, GitLab, Bitbucket, Gitea, Self-Hosted).
- **Context Engine**: Maps `repository -> remote -> provider -> account -> identity -> SSH credentials`.

### Resolution Precedence Hierarchy (Highest to Lowest)
1. **Tier 1: Local Repository Override** (`.git/gitbridge.json` or `.gitbridge.json`): Direct per-repo setting. Takes absolute priority.
2. **Tier 2: Repository Profile** (`repos.json`): Stored globally via `gb repo set` or `gb init`.
3. **Tier 3: Directory Rule** (`config.json`): Longest prefix match against configured rules (compiled to `[includeIf "gitdir:..."]`).
4. **Tier 4: Global Default Identity** (`defaultIdentityId`).
5. **Tier 5: System Git Fallback** (`~/.gitconfig` `user.name` / `user.email`).

---

## 3. Operational Runbooks

### Runbook 1: Pinning a Selected Repository to an Email & Provider (Persistent Memory)
When the user asks to configure a specific repository:

1. **Pin from inside the repository**:
   ```bash
   cd /path/to/my-repo
   gb repo set . --identity work --provider gitlab --account gitlab_fuadt
   ```
2. **Pin by providing an email directly**:
   ```bash
   gb repo set /path/to/my-repo --email "fuad@workcorp.com" --provider gitlab
   ```
3. **Verify the binding**:
   ```bash
   gb context
   ```
   *GitBridge writes `.git/gitbridge.json`, records the profile in `~/.gitbridge/repos.json`, and installs safety hooks. It will remember this configuration permanently without ever asking again.*

---

### Runbook 2: Setting Up a New Git Identity & Provider Account

1. **Add Identity**:
   ```bash
   gb id add --id insa --name "Fuad Tesfaye" --email "fuadt@insa.gov.et"
   ```
2. **Authenticate Provider**:
   ```bash
   # GitHub with Personal Access Token & SSH Key:
   gb auth login github --token <token> --ssh-key ~/.ssh/id_ed25519

   # GitLab (cloud or self-hosted) with credentials:
   gb auth login gitlab -u "fuadt" -p "password" --host "http://172.27.23.116" --ssh-key ~/.ssh/id_ed25519
   ```
3. **Map Directory Rule**:
   ```bash
   gb rules add ~/Insa insa --provider gitlab --account gitlab_fuadt
   ```
4. **Compile & Activate**:
   ```bash
   gb enable
   ```

---

### Runbook 3: Running Security Audits & Auto-Remediation

GitBridge includes a built-in **Fort Knox** security subsystem:

1. **Run Full Security Audit**:
   ```bash
   gb sec check
   ```
   *Inspects:*
   - Filesystem permissions (verifies `0700` directories and `0600` files).
   - Keyring backend status & hardware-bound AES-256-GCM vault.
   - Staged changes for accidental API tokens, private keys, or `.env` files.
   - Plaintext credentials embedded in Git remote URLs.
   - Pre-commit and pre-push hook protection status.

2. **Auto-Remediate All Findings**:
   ```bash
   gb sec fix
   ```
   *Automatically locks permissions to `0700`/`0600`, scrubs plaintext remote tokens into the OS Keyring, and activates safety hooks.*

3. **Scan Codebase for Secrets**:
   ```bash
   gb sec scan [path]
   ```

---

### Runbook 4: Native Git & IDE Transparent Integration

To ensure IDEs (VS Code, Cursor, Antigravity) and native terminal commands (`git commit`, `git push`) use GitBridge automatically:

1. **Enable Native Git Override**:
   ```bash
   gb override enable
   ```
2. **Sync Installed IDEs**:
   ```bash
   gb ide sync
   ```
3. **Verify Setup**:
   ```bash
   gb doc
   ```

---

## 4. Development & Testing Commands

When working on the GitBridge codebase:
```bash
# Run test suite
bun test

# Typecheck without emitting
bun run typecheck

# Production build
bun run build

# Run local CLI
bun run bin/gb.ts --help
```
