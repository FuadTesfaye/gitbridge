# GitBridge 🌉

> **Universal Git Identity, Multi-Account & Provider Management Layer**
> Seamlessly manage identities, accounts, and providers (GitHub, GitLab, Bitbucket, Gitea) across Git workflows without intercepting or replacing the native `git` CLI.

---

## 🌟 Highlights

- ⚡ **Native Git First**: Works with native `git commit`, `git push origin main`, and `git clone`. No intrusive executable wrappers or aliases needed.
- 🗂️ **Directory-Based Identity Switching**: Powered by Git's official `includeIf` conditional includes (`~/Projects/work/**` vs `~/Projects/personal/**`).
- 🔑 **Multi-Account OAuth & PAT Credential Helper**: Plugs into `credential.helper` to retrieve tokens on-demand from your OS keychain.
- 🛡️ **Zero Plaintext Secrets**: Sensitive access tokens are stored in the **Linux Secret Service (secret-tool)**, **macOS Keychain**, or **Windows Credential Manager** with an AES-256-GCM encrypted vault fallback.
- 🚀 **SSH Multi-Key Host Routing**: Dynamically creates SSH Host aliases (`github.com-work`, `github.com-personal`) and links keys to accounts seamlessly.
- 🚨 **Pre-Commit Identity Safety Guard**: Optional opt-in check to prevent accidental commits with mismatched emails in work repositories.
- 🔄 **Multi-Remote Parallel Push**: Push branches to GitHub, GitLab, and Bitbucket simultaneously with `gitbridge push --all`.
- 🔁 **Reversible & Non-Destructive**: Safe managed blocks in `~/.gitconfig` and `~/.ssh/config` with automated backups and instant rollback on `gitbridge disable`.

---

## 📦 Installation

```bash
# Install globally via npm / bun
npm install -g gitbridge

# Exposes both 'gitbridge' and 'gb'
gitbridge --version
gb --version
```

---

## 🚀 Quick Start

### 1. Run Interactive Onboarding
```bash
gitbridge setup
```
The interactive wizard will guide you through:
1. Creating your primary and secondary Git identities (e.g. `personal`, `work`).
2. Connecting providers (GitHub Device Flow, GitLab PAT, Bitbucket).
3. Mapping workspace directory rules (e.g. `~/Projects/work` $\to$ `work`).
4. Activating Git and SSH integration.

### 2. Verify System Diagnostics
```bash
gitbridge doctor
```
Checks Git CLI version, Bun runtime, OS Keychain backends, SSH keys, and provider API connectivity.

### 3. Initialize a Repository Profile
```bash
cd ~/Projects/my-app
gitbridge init
```
Interactively selects your Git identity, links provider remotes, and optionally installs the pre-commit identity safety guard.

### 4. Normal Git Operations
```bash
git add .
git commit -m "feat: core functionality"
git push origin main
```
Native Git automatically uses the correct identity and authentication credentials!

---

## 📖 Command Reference

| Command | Alias | Description |
|---|---|---|
| `gitbridge setup` | | Interactive onboarding wizard for initial configuration |
| `gitbridge status` | | Show overview of status, identities, accounts, and directory rules |
| `gitbridge context` | `gb ctx` | Show context breakdown for current directory/repository |
| `gitbridge enable` | | Activate GitBridge integration in `~/.gitconfig` and `~/.ssh/config` |
| `gitbridge disable` | | Safely deactivate and restore original Git configuration |
| `gitbridge switch [id]` | | Quick shortcut to switch identity for repo or globally (`-g`) |
| `gitbridge init` | | Configure GitBridge identity and remotes for the current repo |
| `gitbridge identity list` | `gb id ls` | List all configured identities |
| `gitbridge identity add` | `gb id add` | Add a new Git identity (interactive or with flags) |
| `gitbridge identity use <id>` | | Set an identity as global default |
| `gitbridge identity remove <id>`| `gb id rm` | Remove an identity |
| `gitbridge account list` | `gb acc ls`| List authenticated provider accounts |
| `gitbridge account remove <id>` | `gb acc rm`| Remove an account and wipe its token |
| `gitbridge auth login [prov]` | | Authenticate with GitHub, GitLab, or Bitbucket |
| `gitbridge auth logout <prov>` | | Log out of a provider and remove credentials |
| `gitbridge provider list` | `gb prov ls`| List supported and registered Git providers |
| `gitbridge rule list` | `gb rule ls`| List directory routing rules |
| `gitbridge rule add [dir] [id]` | | Map a directory path to an identity |
| `gitbridge rule remove <id>` | `gb rule rm`| Remove a directory routing rule |
| `gitbridge remote list` | | List remotes for current repository |
| `gitbridge remote add <n> <u>` | | Add remote with optional account SSH alias |
| `gitbridge push [remote]` | | Push branch to configured remotes or multi-provider (`--all`) |
| `gitbridge doctor` | | Run complete system diagnostic health check |

---

## 🏗️ Architecture & Resolution Precedence

When Git or GitBridge resolves an identity for any directory:

$$\text{Local Repository Profile} \succ \text{Directory Rule (includeIf)} \succ \text{Global Default Identity} \succ \text{System Git Config}$$

```
                                  Developer / IDE
                               (VS Code, Terminal, Neovim, JetBrains)
                                         │
                                         │  (Standard git commands)
                                         ▼
                                     Native Git
                                         │
             ┌───────────────────────────┼───────────────────────────┐
             │                           │                           │
    [includeIf / .gitconfig]    [credential.helper]           [~/.ssh/config]
             │                           │                           │
             ▼                           ▼                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       GitBridge Core (`gitbridge` / `gb`)                  │
│                                                                            │
│  ┌─────────────────────────┐  ┌──────────────────────┐  ┌────────────────┐ │
│  │     Identity Engine     │  │     Remote Engine    │  │  Safety Engine │ │
│  │ (Resolves name & email) │  │  (URL / Host routing)│  │ (Pre-commit)   │ │
│  └────────────┬────────────┘  └──────────┬───────────┘  └───────┬────────┘ │
│               │                          │                      │          │
│               └──────────────────────────┼──────────────────────┘          │
│                                          │                                 │
│                               ┌──────────▼───────────┐                     │
│                               │   Context Resolver   │                     │
│                               │ (Precedence: Repo >  │                     │
│                               │  Directory > Global) │                     │
│                               └──────────┬───────────┘                     │
│                                          │                                 │
│         ┌────────────────────────────────┴───────────────────┐             │
│         ▼                                                    ▼             │
│  ┌──────────────┐                                    ┌──────────────┐      │
│  │ Auth Engine  │                                    │ Config Store │      │
│  └──────┬───────┘                                    └──────┬───────┘      │
└─────────┼───────────────────────────────────────────────────┼──────────────┘
          │                                                   │
   ┌──────┴───────────────┐                            ┌──────┴──────────────┐
   ▼                      ▼                            ▼                     ▼
Provider Adapters    Secure Credential Store    File Storage        Generated Config
- GitHub             - Linux Secret Service    ~/.gitbridge/        - main.gitconfig
- GitLab             - macOS Keychain          - config.json        - ssh_config
- Bitbucket          - Windows Cred Manager    - identities.json    - rules/*.gitconfig
- Custom / Gitea     - Fallback Encrypted Vault - accounts.json
```

---

## 🔒 Security Model & Local-Only Architecture

GitBridge is engineered with a **zero-trust, local-only security architecture**:

- 🛡️ **100% Local Execution**: GitBridge operates exclusively on your local machine. It has **no telemetry, no tracking, and no external cloud servers**. Requests are made only directly to the Git providers you configure (GitHub, GitLab, Bitbucket).
- 🔑 **Hardware-Backed OS Keychains**: Access tokens and passwords are **never written to plain JSON files, logs, or git config files**. They are stored directly in your operating system's native secure keyring:
  - **Linux**: Linux Secret Service (`secret-tool` / libsecret / DBus Session Keyring).
  - **macOS**: Apple Keychain Services (`/usr/bin/security` backed by Secure Enclave).
  - **Windows**: Windows Credential Manager (DPAPI-encrypted).
- 🔐 **Air-Gapped / Headless Fallback**: In environments without a graphical keychain daemon (e.g. CI containers), credentials are encrypted in `~/.gitbridge/vault.enc` using **AES-256-GCM** with a **PBKDF2** machine-unique derivation key (100,000 rounds of SHA-256 with cryptographically random salt and 12-byte IV).
- 📁 **Restricted POSIX Permissions**: All configuration and generated files enforce strict permission modes:
  - `~/.gitbridge/` directory: `0700` (`rwx------`, owner only)
  - Config, key & vault files: `0600` (`rw-------`, owner only)
- 🗝️ **SSH Key Isolation**: Dedicated `Host <host>-<account_id>` blocks enforce `IdentitiesOnly yes`, ensuring the SSH agent only presents the specific key mapped to that account—preventing cross-account identity leaks.

---

## 🧪 Testing

```bash
# Run unit & integration tests
bun test

# Run typecheck
bun run typecheck
```

---

## 📄 License

MIT © Fuad Tesfaye
