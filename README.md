# GitBridge 🌉

[![npm version](https://img.shields.io/npm/v/@fuad24/gitbridge.svg)](https://www.npmjs.com/package/@fuad24/gitbridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-225%20passed-brightgreen.svg)](https://github.com/FuadTesfaye/gitbridge)
[![Security](https://img.shields.io/badge/security-OS%20keyring%20%2B%20AES--256--GCM-blue.svg)](https://github.com/FuadTesfaye/gitbridge)
[![Telemetry](https://img.shields.io/badge/telemetry-zero%20(100%25%20offline--first)-blueviolet.svg)](https://github.com/FuadTesfaye/gitbridge)

> **GitBridge is a zero-wrapper Git context manager that automatically maps every repository to the correct author identity, provider account, authentication credentials, and SSH configuration while preserving your standard Git workflow.**

Work seamlessly across **GitHub**, **GitLab**, **Bitbucket**, enterprise self-hosted servers, personal side-projects, and corporate codebases without manually editing Git configs, juggling SSH host aliases, or accidentally committing work code under your personal email.

---

## Table of Contents

- [The Core Architecture: Three Decoupled Layers](#1-the-core-architecture-three-decoupled-layers)
- [How It Is Safe & How Things Are Stored Locally](#2-how-it-is-safe--how-things-are-stored-locally)
- [Installation & Setup](#3-installation--setup)
- [Quick Start in 60 Seconds](#4-quick-start-in-60-seconds)
- [Core Features & Usage](#5-core-features--usage)
  - [1. Status, Context & Prompt Badges](#1-status-context--shell-prompt-badges)
  - [2. Decision Tree Transparency (`gb explain`)](#2-decision-tree-transparency-gb-explain)
  - [3. Proactive Next-Step Recommendations (`gb suggest`)](#3-proactive-next-step-recommendations-gb-suggest)
  - [4. Smart Clone with Access Tracking (`gb clone`)](#4-smart-clone-with-automated-access-tracking-gb-clone)
  - [5. Workspace Directory Rule Inheritance (`gb rules`)](#5-workspace-directory-rule-inheritance-gb-rules)
  - [6. Persistent Repository Binding (`gb repo`)](#6-persistent-repository-binding-gb-repo)
  - [7. Git-Native Typo Autocorrection & Interactive Auto-Run](#7-git-native-typo-autocorrection--interactive-auto-run)
  - [8. Built-in Security Audit & Auto-Remediation (`gb sec`)](#8-built-in-security-audit--auto-remediation-gb-sec)
  - [9. Native Git Interoperability & Optional Shims (`gb override`)](#9-native-git-interoperability--optional-shims-gb-override)
  - [10. First-Class IDE Synchronization (`gb ide`)](#10-first-class-ide-synchronization-gb-ide)
  - [11. Modern SSH Key Management (`gb ssh`)](#11-modern-ssh-key-management-gb-ssh)
  - [12. Concurrent Multi-Remote Push (`gb push`)](#12-concurrent-multi-remote-push-gb-push)
  - [13. System Diagnostics & Self-Healing (`gb doc`)](#13-system-diagnostics--self-healing-gb-doc)
- [Complete CLI Command Matrix](#6-complete-cli-command-matrix)
- [Development & Verification](#7-development--verification)
- [License](#8-license)

---

## 1. The Core Architecture: Three Decoupled Layers

In traditional Git, your author email, your hosting account, and your SSH key are entangled. GitBridge cleanly separates them into three independent layers:

```text
                     GITBRIDGE
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
    IDENTITY          ACCOUNT          PROVIDER
   "Who am I?"    "Which account?"  "Where is the code?"
   (Name, Email,  (Username, PAT,   (GitHub, GitLab,
   Signing Key)   Keyring Token)    Bitbucket, Self-Hosted)
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                   CONTEXT ENGINE
                         │
            Repository → Remote → Provider →
            Account → Identity → SSH Credentials
                         │
                         ▼
                  Native Git & SSH
             (git commit, git push, IDE)
```

### Why This Separation Matters:
- **Email ≠ Hosting Account**: Your commit identity `alice@company.com` is distinct from your GitHub username `@alice-corp` or GitLab handle `@alice`.
- **One Identity Spans Multiple Providers**: Your single work identity can seamlessly span GitHub, GitLab, and internal Git servers.
- **Context is Auto-Resolved**: When you enter a repository, GitBridge inspects the repository root, directory rules, and remote URLs to activate the exact identity and credentials bundle automatically.

---

## 2. How It Is Safe & How Things Are Stored Locally

GitBridge is designed from the ground up to be **non-intrusive, zero-telemetry, and offline-first**.

### 100% Offline-First & Zero Telemetry
- **Zero External Tracking**: GitBridge **never** transmits configurations, repository paths, SSH keys, or credentials to any remote server or analytics service.
- **Direct Provider Communication**: Network traffic occurs **only** when you explicitly authenticate (`gb auth login`), clone a repository, or check API connectivity (`gb doctor`), communicating directly with your configured Git providers (e.g. `api.github.com`, your GitLab instance).

### Local Storage Architecture (`~/.gitbridge`)
All GitBridge configuration is stored in your user profile under `~/.gitbridge` (configurable via `GITBRIDGE_HOME` or `XDG_CONFIG_HOME`):

| File Path | Mode | Contents & Security Model |
|---|---|---|
| `~/.gitbridge/config.json` | `0600` | Global settings, provider configurations, and directory routing rules |
| `~/.gitbridge/identities.json` | `0600` | Registered Git author profiles (Name, Email, Signing Key) |
| `~/.gitbridge/accounts.json` | `0600` | Account metadata (Username, host, linked SSH key path — **no tokens stored here**) |
| `~/.gitbridge/repos.json` | `0600` | Explicit local repository overrides and remembered bindings |
| `~/.gitbridge/vault.enc` | `0600` | Authenticated fallback encrypted vault (**AES-256-GCM** + **PBKDF2**) |
| `~/.gitbridge/generated/main.gitconfig` | `0600` | Compiled native Git config included via `~/.gitconfig` |
| `~/.gitbridge/generated/ssh_config` | `0600` | Compiled SSH host aliases included via `~/.ssh/config` |
| `~/.gitbridge/generated/rules/*.gitconfig` | `0600` | Per-directory compiled Git rules with `[user]` and `[url]` blocks |
| `~/.gitbridge/backups/` | `0700` | Automated timestamped backups of `~/.gitconfig` and `~/.ssh/config` before any modification |

### Keyring Integration
Personal access tokens and OAuth secrets are **never stored in plaintext** in GitBridge config files. They are saved in the OS credential manager when available:
- **macOS**: Apple Keychain via `/usr/bin/security`
- **Linux / BSD**: Secret Service API via `secret-tool` (secret on stdin)
- **Windows**: Windows Credential Manager via `CredWrite`/`CredRead` (secret on stdin, not `cmdkey /pass`)
- **Encrypted vault fallback**: If no system keyring is available, tokens go in `~/.gitbridge/vault.enc` using **AES-256-GCM** with **PBKDF2-HMAC-SHA-256** (100,000 iterations). The wrapping key is a machine fingerprint (hostname, user, home, machine-id) — it prevents casual copying to another machine, not a same-user attacker.

### Strict Defensive Hardening
- **POSIX Permission Lockdown**: `~/.gitbridge` directories are `0700`, sensitive files are written atomically with mode `0600`.
- **CRLF and token injection controls**: User inputs written into Git/SSH config are sanitized; SSH `Host`/`IdentityFile` values are allowlisted.
- **Credential helper host matching**: Git only receives a PAT when the requested host matches the stored account. The helper is `!gitbridge credential` so native Git can invoke it.
- **Untrusted Repo Isolation**: GitBridge ignores working-tree `.gitbridge.json` files so a cloned repo cannot hijack your commit identity.
- **Zero Wrapper Overhead by default**: Standard `git commit` and `git push` run against native Git. `gb override` is opt-in.

---

## 3. Installation & Setup

### One-Line Installers

**Linux & macOS:**
```bash
curl -fsSL https://cdn.jsdelivr.net/gh/FuadTesfaye/gitbridge@main/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://cdn.jsdelivr.net/gh/FuadTesfaye/gitbridge@main/install.ps1 | iex
```

### Global Install via npm or Bun
```bash
npm install -g @fuad24/gitbridge
# or
bun add -g @fuad24/gitbridge
```

### Dual CLI Binaries
GitBridge ships with two CLI entrypoints:
- `gb`: Fast shorthand for daily terminal usage (`gb st`, `gb ctx`, `gb clone`).
- `gitbridge`: Full command name (`gitbridge status`, `gitbridge setup`).

---

## 4. Quick Start in 60 Seconds

### Step 1: Run Instant Setup
```bash
# 1-second automated setup (scans Git remotes, SSH keys, and configures defaults):
gb setup --quick

# Or run the guided interactive onboarding wizard:
gb setup
```

### Step 2: Add Your Identities
```bash
# Add personal identity:
gb id add --id personal --name "Alice Doe" --email "alice@gmail.com" --default

# Add company identity:
gb id add --id work --name "Alice Doe" --email "alice@company.com"
```

### Step 3: Authenticate Accounts
```bash
# Authenticate GitHub (via web browser device flow or PAT):
gb auth login github

# Authenticate GitLab (supports self-hosted instances):
gb auth login gitlab --host gitlab.company.com
```

### Step 4: Map Your Folders
```bash
# All repositories inside ~/work will commit as Alice Work:
gb rules add ~/work work --provider gitlab

# All repositories inside ~/Personal will commit as Alice Personal:
gb rules add ~/Personal personal --provider github
```

### Step 5: Activate Native Integration
```bash
gb enable
```

**Done!** When you navigate into any repository, native `git commit` and `git push` will automatically use the correct author profile and SSH key.

---

## 5. Core Features & Usage

### 1. Status, Context & Shell Prompt Badges

Inspect your active configuration and verify what Git will do in the current directory:

```bash
# Show global GitBridge status (identities, accounts, rules, integration status):
gb st

# Inspect resolved identity, remote URL, provider, and SSH key for current folder:
gb ctx

# Machine-readable JSON output for scripts, CI, and IDE extensions:
gb ctx --json

# Print active author name and email:
gb cur

# Get a compact, colorized badge for your shell prompt (e.g. "[github:alice] [personal]"):
gb cur -p
```

**Add to your shell prompt:**
```bash
# ~/.bashrc or ~/.zshrc:
export PS1="\u@\h:\w \$(gb cur -p)\$ "
```

---

### 2. Decision Tree Transparency (`gb explain`)

Never wonder *why* Git committed with a specific email again. `gb explain` walks the 6 deterministic resolution tiers and explains the exact reasoning:

```bash
gb explain
```

```text
  GITBRIDGE DECISION TREE (WHY?)
  ──────────────────────────────────────────────────
  Directory:              /home/alice/work/api-gateway
  Repository Root:        /home/alice/work/api-gateway

  Resolution Hierarchy Analysis:
    ○ Tier 1: Local Repository Override (.git/gitbridge.json) (none found)
    ○ Tier 2: Repository Profile (repos.json) (none found)
    ✔ Tier 3: Directory Rule (rule_work)
      Path pattern: ~/work (expanded: /home/alice/work)
      Won via longest-prefix path match among 2 configured rule(s).
      Mapped to identity ID: 'work'
    ○ Tier 4: Remote Repository Access Detection (skipped)
    ○ Tier 5: Global Default Identity (skipped)
    ○ Tier 6: System Git Fallback (skipped)

  Final Resolved Outcomes:
    • Identity:          Alice Doe <alice@company.com>
    • Provider Account:  GITLAB (alice-work)
    • SSH Key:           /home/alice/.ssh/id_ed25519_corp
    • Remote Provider:   GitLab (gitlab.company.com) - Configured
```

---

### 3. Proactive Next-Step Recommendations (`gb suggest`)

Run `gb suggest` (or `gb next`) in any folder. GitBridge analyzes your workspace, remotes, identity alignment, and integration status, providing ranked, contextual recommendations:

```bash
gb suggest
```

```text
  GitBridge Proactive Suggestions
  ──────────────────────────────────────────────────
  Target: api-gateway (/home/alice/work/api-gateway)
  Active: Alice Doe <alice@company.com> [work]

  1. [RECOMMENDED] Enable native Git command override
     Transparently route standard 'git' commands through GitBridge shims with zero wrapper friction.
     gb override enable

  2. [INFO] Synchronize installed IDEs (VS Code, Cursor, Antigravity)
     Configure your editor's internal Git client to respect GitBridge identities automatically.
     gb ide sync

  3. [INFO] Verify security audit & install pre-commit guards
     Audit permissions, scrub plaintext credentials, and verify identity protection hooks.
     gb security check
```

---

### 4. Smart Clone with Automated Access Tracking (`gb clone`)

Clone any repository with automated account detection and persistent context binding:

```bash
# Smart clone:
gb clone git@github.com:organization/project.git

# Clone with explicit identity, account, or email override:
gb clone git@gitlab.com:client/repo.git -i work -a gitlab_alice -e "alice@company.com"
```

**What `gb clone` does automatically:**
1. **Namespace Match**: Detects if the repository namespace belongs to an authenticated account.
2. **Token API Probe**: Queries GitHub, GitLab, or Bitbucket APIs using your OS Keyring tokens to verify repository access permissions.
3. **SSH Key Routing**: Configures SSH alias routing so native Git uses the exact private key linked to that account.
4. **Persistent Binding**: Writes `.git/gitbridge.json`, registers the profile in `repos.json`, configures local `user.name` & `user.email`, and installs pre-commit safety guards. **It remembers forever.**

---

### 5. Workspace Directory Rule Inheritance (`gb rules`)

Map folders to identities. Everything inside that folder automatically inherits the profile:

```bash
# List directory rules:
gb rules ls

# Add rule mapping ~/work to the 'work' identity:
gb rules add ~/work work --provider gitlab --account gitlab_work

# Add rule mapping ~/Personal to the 'personal' identity:
gb rules add ~/Personal personal --provider github

# Remove a rule:
gb rules rm rule_work
```

---

### 6. Persistent Repository Binding (`gb repo`)

Lock any repository permanently to an identity, email, or provider:

```bash
# Bind current repository to identity 'work':
gb repo set . --identity work

# Bind by email address:
gb repo set . --email "alice@company.com" --provider gitlab

# List all remembered repository profiles:
gb repo ls

# Remove persistent repository profile:
gb repo rm .
```

---

### 7. Git-Native Typo Autocorrection & Interactive Auto-Run

GitBridge features Git-exact error phrasing and interactive execution in TTY sessions:

```text
$ gb stauts --json
gb: 'stauts' is not a gb command. See 'gb --help'.

The most similar command is:
  gb status (or 'gb st')
  Show overall GitBridge status, active identities, accounts, and rules

? Would you like to run 'gb status --json' instead? (Y/n)
```

- **Argument Preservation**: Flags and parameters (`--json`, `-i work`, paths) are preserved when executing the suggested command.
- **Non-Interactive Safety**: In scripts, CI/CD, or with `--no-prompt`, prompts are skipped cleanly.

---

### 8. Built-in Security Audit & Auto-Remediation (`gb sec`)

Run complete security audits covering 6 security layers:

```bash
# Full security audit:
gb sec check
```

```text
  GITBRIDGE SECURITY AUDIT
  ──────────────────────────────────────────────────
  1. Filesystem & Permission Hardening
     ✔ All GitBridge configuration & SSH key files have strict permissions (0700/0600)
  2. Keyring & Vault Architecture
     ✔ Active Keyring Backend: Apple Keychain (with Encrypted Vault fallback)
     ✔ Authenticated Accounts: 2 stored with hardware-bound entropy
  3. Staged Changes Secret Inspection
     ✔ No plaintext API tokens, private keys, or .env files detected in staging area
  4. Remote URL Plaintext Credential Check
     ✔ No plaintext tokens or passwords embedded in repository remotes
  5. Safety Guard & Pre-Commit/Push Protection
     ✔ Pre-Commit Secret Guard: Active
     ✔ Pre-Push Identity Guard:  Active
  6. Configuration Integrity & Repository Trust
     ✔ Git & SSH generated configs verified free of injection vulnerabilities
     ✔ Working-tree root is clean of untrusted configuration files
  ──────────────────────────────────────────────────
  ✔ Security status: Fort Knox (All 6 security layers passing!)
```

```bash
# Auto-lock permissions to 0700/0600, scrub remote tokens, and install hooks:
gb sec fix

# Deep-scan a directory tree for leaked private keys, API tokens, or .env files:
gb sec scan [path]
```

---

### 9. Native Git Interoperability & Optional Shims (`gb override`)

GitBridge works seamlessly through native `[includeIf]` and `credential.helper`. For developers who want standard `git clone` and `git commit` to automatically benefit from GitBridge shims:

```bash
# Enable native git override shims in ~/.gitbridge/shims:
gb override enable

# Check override status:
gb override status

# Safely remove shims and restore original PATH:
gb override disable
```

---

### 10. First-Class IDE Synchronization (`gb ide`)

Synchronize Git path settings with your installed code editors:

```bash
# Sync Git settings with VS Code, Cursor, Antigravity, and VSCodium:
gb ide sync

# Check IDE synchronization status:
gb ide status

# Restore original IDE settings:
gb ide unsync
```

---

### 11. Modern SSH Key Management (`gb ssh`)

```bash
# List discovered SSH keys and linked accounts:
gb ssh ls

# Generate a modern ed25519 SSH key:
gb ssh gen --name id_ed25519_company --email alice@company.com

# Link an SSH key to an authenticated provider account:
gb ssh link ~/.ssh/id_ed25519_company github_alice
```

---

### 12. Concurrent Multi-Remote Push (`gb push`)

Push the active branch across multiple remotes concurrently:

```bash
# Push current branch to all configured remotes simultaneously:
gb push --all

# Push tags:
gb push --tags
```

---

### 13. System Diagnostics & Self-Healing (`gb doc`)

Run end-to-end diagnostics across your Git executable, OS Keyring, SSH keys, and provider APIs:

```bash
gb doc
```

---

## 6. Complete CLI Command Matrix

| Shorthand | Full Command | Parameters / Options | Description |
|---|---|---|---|
| `gb setup` | `gitbridge setup` | `-q, --quick` | Progressive onboarding wizard (`--quick` sets up in 1 second) |
| `gb st` | `gitbridge status` | None | Display identities, accounts, rules, and integration states |
| `gb ctx` | `gitbridge context` | `--json` | Inspect resolved identity context for current directory |
| `gb cur` | `gitbridge current` | `-p, --prompt`, `--email`, `--name` | Print active identity or compact prompt badge |
| `gb explain` | `gitbridge explain` | None | 6-tier decision tree breakdown explaining active identity |
| `gb suggest` | `gitbridge suggest` | None | Context-aware proactive workspace recommendations |
| `gb clone` | `gitbridge clone` | `<url> [dir] [-i id] [-a acc] [-e email]` | Smart clone with access auto-detection & persistent binding |
| `gb repo set` | `gb repo set` | `[path] [-i id] [-e email] [-p prov] [-a acc]` | Permanently bind repository to identity and provider |
| `gb repo ls` | `gb repo list` | None | List remembered repository profiles |
| `gb repo rm` | `gb repo unset` | `[path]` | Remove repository binding |
| `gb sw [id]` | `gitbridge switch [id]` | `-g, --global` | Switch active identity locally or globally |
| `gb env` | `gitbridge env` | None | Print shell exports (`GIT_AUTHOR_NAME`, etc.) |
| `gb init` | `gitbridge init` | None | Interactive repository initialization wizard |
| `gb doc` | `gitbridge doctor` | None | Run toolchain, keyring, SSH, and provider health checks |
| `gb enable` | `gitbridge enable` | None | Inject managed include blocks into `~/.gitconfig` and `~/.ssh/config` |
| `gb disable` | `gitbridge disable` | None | Safely remove GitBridge integration blocks and restore backups |
| `gb id ls` | `gb identity list` | None | List all configured commit identities |
| `gb id add` | `gb identity add` | `--id <id> --name <n> --email <e> [--signing-key <k>]` | Register a new commit author identity |
| `gb id rm` | `gb identity remove`| `<id>` | Delete an identity |
| `gb acc ls` | `gb account list` | None | List authenticated provider accounts |
| `gb acc rm` | `gb account remove` | `<id>` | Delete an account and erase credentials from OS keychain |
| `gb auth login`| `gb auth login` | `[provider] [-t token] [-u user -p pass] [--host h]` | Log in to GitHub, GitLab, or Bitbucket |
| `gb auth logout`| `gb auth logout` | `<provider> [username]` | Revoke and erase credentials from secure storage |
| `gb prov ls` | `gb provider list` | None | List supported providers, active status, and capabilities |
| `gb prov enable`| `gb provider enable`| `<provider>` | Enable a provider |
| `gb prov disable`| `gb provider disable`| `<provider>` | Disable a provider (preserves stored credentials) |
| `gb rules ls` | `gb rule list` | None | List directory routing rules |
| `gb rules add` | `gb rule add` | `<path> <identityId> [--account <acc>]` | Map a workspace directory to an identity |
| `gb rules rm` | `gb rule remove` | `<idOrPath>` | Delete a directory rule |
| `gb ssh ls` | `gb ssh list` | None | List SSH keys in `~/.ssh` and linked accounts |
| `gb ssh gen` | `gb ssh generate` | `[--name <n>] [--email <e>]` | Generate modern ed25519 SSH key |
| `gb ssh link` | `gb ssh link` | `[keyPath] [accountId]` | Associate SSH key with an account |
| `gb sec check`| `gb security check` | None | Full security health audit across 6 security layers |
| `gb sec fix` | `gb security fix` | None | Auto-lock permissions to `0700/0600`, scrub remote tokens, install hooks |
| `gb sec scan`| `gb security scan` | `[path]` | Scan directory tree for private keys, API tokens, and `.env` files |
| `gb override` | `gb override` | `enable \| disable \| status` | Manage transparent native Git override shims |
| `gb ide` | `gb ide` | `sync \| unsync \| status` | Configure Git path & terminal env in VS Code / Cursor / Antigravity |
| `gb push` | `gb push` | `[target] [--all] [--tags] [-f]` | Concurrently push active branch to multiple remotes |
| `gb update` | `gitbridge update` | `[-c, --check] [-f, --force]` | Check for and install latest GitBridge release from npm |
| `gb completion`| `gb completion` | `[bash \| zsh \| fish]` | Generate shell autocompletion script |

---

## 7. Development & Verification

GitBridge is developed in **TypeScript** and built with **Bun**:

```bash
# Run the complete test suite. It runs against a throwaway home directory
# (tests/setup/isolate-home.ts) and never touches your real ~/.gitconfig,
# ~/.ssh/config, shell profiles or editor settings.
bun test

# Typecheck codebase without emitting files
bun run typecheck

# Build production bundles into dist/
bun run build

# Run local binary directly
bun run bin/gb.ts --help
bun run bin/gb.ts st
```

---

## 8. License

MIT License © 2026 Fuad Tesfaye. Designed and crafted with precision for developers operating across multiple Git universes.
