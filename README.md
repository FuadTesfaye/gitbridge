# GitBridge

[![npm version](https://img.shields.io/npm/v/@fuad24/gitbridge.svg)](https://www.npmjs.com/package/@fuad24/gitbridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-44%20passed-brightgreen.svg)](https://github.com/FuadTesfaye/gitbridge/actions)

GitBridge is a lightweight CLI and credential management layer that automates Git identities, provider accounts, and SSH keys across projects and directories.

It operates entirely locally through native Git and SSH configuration hooks (`includeIf`, `credential.helper`, and `~/.ssh/config`), requiring no wrappers or changes to standard `git` commands.

---

## Features

- **Directory-Based Identity Routing**: Automatically switch author names, emails, and GPG/SSH signing keys based on repository paths using Git's native `includeIf` mechanism.
- **SSH Host & Key Isolation**: Route distinct SSH keys to separate accounts on the same provider (e.g. personal vs. work GitHub) using isolated `Host` aliases with `IdentitiesOnly yes`.
- **Native OS Credential Storage**: Store personal access tokens in OS-native secure keychains (Linux Secret Service, macOS Keychain, Windows Credential Manager) with an AES-256-GCM encrypted vault fallback.
- **Zero Runtime Overhead**: Integrates directly into Git and SSH configuration files. Your terminal, IDEs, and Git GUIs continue to invoke native `git` directly.
- **Pre-Commit Identity Guard**: Optional pre-commit hook that verifies author email matches the expected directory identity before commits are written.
- **Dual CLI Binaries**: Provides both `gitbridge` and `gb` commands with concise shorthand aliases.
- **Editor Extension**: Companion extension for VS Code, Cursor, and Antigravity IDE for visual status bar context and identity switching.

---

## Installation

### Using npm
```bash
npm install -g @fuad24/gitbridge
```

### Using Bun
```bash
bun add -g @fuad24/gitbridge
```

Verify installation:
```bash
gb --version
```

---

## Quick Start

### 1. Run Setup Wizard
```bash
gb setup
```
The interactive wizard guides you through:
- Creating personal and work identities (name, email, signing keys).
- Mapping directories to identities (e.g. `~/work/**` -> Work identity).
- Authenticating provider accounts (GitHub, GitLab, Bitbucket).
- Activating Git (`~/.gitconfig`) and SSH (`~/.ssh/config`) configuration blocks.

### 2. Verify Status & Context
```bash
# Check global status
gb st

# Check identity resolution for the current directory
gb ctx
```

### 3. Run System Diagnostics
```bash
gb doc
```
Verifies Git installation, keyring availability, discovered SSH keys, and provider API reachability.

---

## Command Reference

Both `gitbridge` and `gb` are available:

### General & Status
| Shorthand | Full Command | Description |
|---|---|---|
| `gb st` | `gitbridge status` | Display configured identities, accounts, and directory rules |
| `gb ctx` | `gitbridge context` | Show resolved identity and warnings for the current directory |
| `gb sw [id]` | `gitbridge switch [id]` | Switch repository identity (`-g` for global default) |
| `gb init` | `gitbridge init` | Initialize repo profile and install pre-commit guard |
| `gb doc` | `gitbridge doctor` | Run system and connectivity diagnostics |
| `gb enable` | `gitbridge enable` | Inject GitBridge configuration blocks into Git and SSH configs |
| `gb disable` | `gitbridge disable` | Safely remove GitBridge configuration blocks |

### Identity Management (`gb id`)
| Shorthand | Full Command | Description |
|---|---|---|
| `gb id ls` | `gitbridge identity list` | List all configured identities |
| `gb id add` | `gitbridge identity add` | Create a new identity (`--name`, `--email`, `--signing-key`) |
| `gb id use <id>` | `gitbridge identity use <id>` | Set default global identity |
| `gb id rm <id>` | `gitbridge identity remove <id>` | Remove an identity |

### Account & Authentication (`gb acc`, `gb auth`)
| Shorthand | Full Command | Description |
|---|---|---|
| `gb acc ls` | `gitbridge account list` | List authenticated provider accounts |
| `gb acc rm <id>` | `gitbridge account remove <id>` | Remove account and delete credentials from OS keyring |
| `gb auth login [provider]` | `gitbridge auth login` | Authenticate with GitHub, GitLab, or Bitbucket |
| `gb auth logout <provider>` | `gitbridge auth logout` | Log out and revoke stored tokens |

### Directory Rules (`gb rules`)
| Shorthand | Full Command | Description |
|---|---|---|
| `gb rules ls` | `gitbridge rule list` | List directory mapping rules |
| `gb rules add <path> <id>` | `gitbridge rule add` | Map a directory path to an identity |
| `gb rules rm <id>` | `gitbridge rule remove <id>` | Delete a directory rule |

### Remotes & Multi-Push (`gb rem`, `gb push`)
| Shorthand | Full Command | Description |
|---|---|---|
| `gb rem ls` | `gitbridge remote list` | List remotes for current repository |
| `gb rem add <name> <url>` | `gitbridge remote add` | Add remote with automatic SSH host alias routing |
| `gb push --all` | `gitbridge push --all` | Push active branch to all configured remotes concurrently |

---

## How It Works

### 1. Git Identity Routing via `includeIf`
GitBridge generates a modular Git configuration file at `~/.gitbridge/gitconfig` and injects an `include` directive into your `~/.gitconfig`:

```gitconfig
# ~/.gitconfig
# --- BEGIN GITBRIDGE MANAGED BLOCK ---
[include]
    path = ~/.gitbridge/gitconfig
# --- END GITBRIDGE MANAGED BLOCK ---
```

Directory rules compile into conditional includes:
```gitconfig
# ~/.gitbridge/gitconfig
[includeIf "gitdir:~/work/**"]
    path = ~/.gitbridge/identities/work.gitconfig

[includeIf "gitdir:~/personal/**"]
    path = ~/.gitbridge/identities/personal.gitconfig
```

### 2. SSH Account Isolation
When multiple accounts use the same Git provider, GitBridge configures host aliases in `~/.ssh/config` to prevent SSH key collisions:

```sshconfig
Host github.com-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_work
    IdentitiesOnly yes

Host github.com-personal
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_personal
    IdentitiesOnly yes
```

### 3. Secure Credential Helper
GitBridge implements the standard Git credential helper protocol:
```bash
git config --global credential.helper "gitbridge credential"
```
Credentials queried by Git are resolved from:
1. **Linux**: Secret Service API (`libsecret` / `secret-tool`)
2. **macOS**: Keychain Services (`/usr/bin/security`)
3. **Windows**: Windows Credential Manager (DPAPI)
4. **Headless/Fallback**: Local encrypted vault (`~/.gitbridge/vault.enc`, AES-256-GCM with PBKDF2 key derivation)

---

## Identity Resolution Order

When determining the active identity for a Git repository, GitBridge applies the following precedence:

1. **Local Repository Profile**: Explicit override configured in `.git/config` or `.gitbridge/repo.json`.
2. **Directory Rule**: Most specific matching `includeIf "gitdir:..."` rule.
3. **Global Default**: The fallback identity marked as default in GitBridge.
4. **System Git Config**: Existing global `user.name` and `user.email` in `~/.gitconfig`.

---

## IDE Extension

GitBridge includes an extension for VS Code, Cursor, and Antigravity IDE (available in [`extension/`](./extension)):

- **Status Bar Indicator**: Real-time display of the resolved identity and account for the active file.
- **Sidebar Explorer**: Interactive view of active context, configured identities, authenticated accounts, and directory rules.
- **Live State Synchronization**: File watcher updates the IDE UI immediately when identities or configurations change via CLI.

---

## Development & Testing

```bash
# Clone the repository
git clone https://github.com/FuadTesfaye/gitbridge.git
cd gitbridge

# Install dependencies
bun install

# Run test suite (44 unit & integration tests)
bun test

# Typecheck
bun run typecheck

# Build CLI and extension bundles
bun run build
```

---

## License

[MIT](LICENSE) © [Fuad Tesfaye](https://github.com/FuadTesfaye)
