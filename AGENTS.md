# GitBridge: Universal Git Identity & Multi-Account Management Layer

Welcome to **GitBridge**! This document provides essential architectural context, directory layout, core concepts, command references, and development guidelines for AI assistants (Antigravity, Cursor, Claude Code, Copilot, etc.) working in this repository.

---

## 1. Project Overview & Mission

**GitBridge** is a lightweight, zero-overhead developer tool and CLI that automates Git identities, provider accounts, and SSH keys across projects and directories.

### Core Philosophy: Native & Non-Intrusive
- **Zero Runtime Wrapper Overhead**: GitBridge integrates natively into Git and SSH configuration files (`~/.gitconfig` via `includeIf`, `credential.helper`, and `~/.ssh/config`). Standard Git commands (`git commit`, `git push`, IDE GUIs) run directly against the native Git executable without mandatory custom wrappers.
- **Optional Transparent Override**: For seamless shell and IDE integration, GitBridge provides cross-platform shims (`~/.gitbridge/shims/git`) and IDE configuration syncing (`git.path`), automatically setting commit author identities and verifying commit safety.
- **Hardware & Native Keychain Security**: Personal access tokens and credentials are saved in OS-native secure storage (macOS Keychain, Linux Secret Service / `libsecret`, Windows Credential Manager / DPAPI) with an AES-256-GCM PBKDF2-derived encrypted vault fallback.
- **Companion IDE Extension**: Includes a first-class editor extension (`extension/`) supporting VS Code, Cursor, and Antigravity IDE for status-bar identity monitoring, one-click switching, and context inspection.

---

## 2. Repository Architecture & Layout

```text
gitbridge/
├── bin/                                # CLI Entrypoints
│   ├── gitbridge.ts                    # Full binary entry: gitbridge <cmd>
│   └── gb.ts                           # Short alias entry: gb <cmd>
├── src/
│   ├── index.ts                        # Main library export
│   ├── cli/                            # Command Line Interface Layer
│   │   ├── index.ts                    # Commander program builder & routing
│   │   ├── commands/                   # Command handlers (status, switch, override, etc.)
│   │   └── ui/                         # Clack prompts, cli-table3 views, banners, help
│   ├── core/                           # Domain Core Engine
│   │   ├── config/                     # Schemas (Zod), PathResolver, ConfigStore
│   │   ├── git/                        # Git CLI runner, includeIf generator, injector, proxy
│   │   ├── ssh/                        # SSH config generator, host alias injector, key detector
│   │   ├── storage/                    # OS Keyrings (Linux/macOS/Windows) & Encrypted Vault
│   │   ├── identity/                   # IdentityResolver (precedence resolution engine)
│   │   ├── safety/                     # IdentityGuard & pre-commit hook validator
│   │   ├── ide/                        # IdeSyncManager (VS Code, Cursor, Antigravity, JetBrains)
│   │   └── providers/                  # GitHub, GitLab, Bitbucket API & device auth handlers
│   └── utils/                          # Logger, HTTP client, proc runner, platform utilities
├── extension/                          # Companion VS Code / Cursor / Antigravity IDE Extension
│   ├── src/
│   │   ├── extension.ts                # VS Code extension entry point
│   │   ├── controllers/                # Status bar, file watcher, commands
│   │   └── providers/                  # Activity Bar & SCM TreeDataProviders
│   └── test/                           # Extension unit and integration test suite
├── tests/                              # Core Test Suites (Bun Test)
│   ├── unit/                           # Isolated unit tests for all core modules
│   └── integration/                    # End-to-end Git lifecycle and credential tests
├── scripts/
│   └── build.ts                        # Production bundler (esbuild -> dist/)
├── AGENTS.md                           # This AI context & guidance document
└── package.json                        # Scripts, dependencies, binary mappings
```

---

## 3. Storage Model & Data Locations

GitBridge stores its configuration in `~/.gitbridge` (configurable via `GITBRIDGE_HOME` or `XDG_CONFIG_HOME`):

| File Path | Description | Schema / Format |
|---|---|---|
| `~/.gitbridge/config.json` | Main global configuration & directory rules | `MainConfig` (Zod) |
| `~/.gitbridge/identities.json` | Configured Git author profiles | `IdentitiesFile` (Zod) |
| `~/.gitbridge/accounts.json` | Authenticated Git provider accounts | `AccountsFile` (Zod) |
| `~/.gitbridge/repos.json` | Explicit local repository overrides | `RepositoriesFile` (Zod) |
| `~/.gitbridge/vault.enc` | Encrypted fallback token store | AES-256-GCM (PBKDF2) |
| `~/.gitbridge/generated/main.gitconfig` | Compiled Git configuration block | Gitconfig with `includeIf` |
| `~/.gitbridge/generated/ssh_config` | Compiled SSH host alias definitions | SSH client config |
| `~/.gitbridge/generated/rules/*.gitconfig` | Individual directory rule Git configs | Gitconfig with `[user]` & `[url]` |
| `~/.gitbridge/shims/git` | Native Git interceptor shim (Unix/CMD/PowerShell) | Shell script / batch |

---

## 4. Identity Resolution Hierarchy

When GitBridge resolves the active Git author name, email, and signing key for a directory or repository, it applies the following deterministic precedence:

```mermaid
flowchart TD
    Start[Resolve Target Directory / Repo] --> CheckRepoProfile{Explicit Repo Profile in repos.json?}
    CheckRepoProfile -- Yes --> ApplyRepo[1. Use Repository Profile Identity]
    CheckRepoProfile -- No --> CheckRules{Directory Matches a Rule?}
    CheckRules -- Yes --> ApplyRule[2. Use Directory Rule Identity (Longest Prefix Match)]
    CheckRules -- No --> CheckDefault{Global Default Identity Set?}
    CheckDefault -- Yes --> ApplyDefault[3. Use Global Default Identity]
    CheckDefault -- No --> CheckSystem{System gitconfig has user.name/email?}
    CheckSystem -- Yes --> ApplySystem[4. Use System Git Fallback]
    CheckSystem -- No --> ApplyUnconf[5. Unconfigured State]
```

1. **Repository Profile** (`repo_profile`): Stored in `repos.json` or explicitly set via `gb init` / `gb switch`.
2. **Directory Rule** (`directory_rule`): Longest prefix match against configured rules in `config.json` (compiled to Git's native `[includeIf "gitdir:~/work/**"]`).
3. **Global Default** (`global_default`): Designated fallback identity in `config.json` (`defaultIdentityId` or `isDefault: true`).
4. **System Fallback** (`system_fallback`): Existing `user.name` and `user.email` from `~/.gitconfig`.
5. **Unconfigured**: No valid identity found.

---

## 5. Dual CLI Commands & Quick Shorthand Reference

GitBridge provides dual binaries: `gitbridge` (verbose) and `gb` (fast shorthand).

### Status, Context & Diagnostics
- `gb st` (`gitbridge status`): Display active identities, accounts, rules, and integration states.
- `gb ctx` (`gitbridge context`): Inspect identity resolution, active remotes, and mismatch warnings for `cwd`.
- `gb doc` (`gitbridge doctor`): Run comprehensive diagnostics on Git CLI, keyrings, SSH keys, and provider APIs.

### Identity Management
- `gb id ls`: List all configured Git identities.
- `gb id add --id <id> --name "<name>" --email "<email>" [--signing-key <key>] [--default]`: Register new identity.
- `gb id use <id>`: Set an identity as global default.
- `gb id rm <id>`: Delete an identity.

### Provider Accounts & Authentication
- `gb acc ls`: List authenticated accounts.
- `gb acc rm <id>`: Delete an account and erase credentials from OS keychain.
- `gb auth login [github|gitlab|bitbucket] [--token <pat>] [--host <custom-host>] [--ssh-key <path>]`: Log in to provider.
- `gb auth logout <provider> [username]`: Revoke credentials.
- `gb prov ls`: List supported providers and their API configurations.

### Directory Rules
- `gb rules ls`: List directory mapping rules.
- `gb rules add <path> <identityId> [--provider <prov>] [--account <accId>]`: Map a folder to an identity.
- `gb rules rm <idOrPath>`: Remove directory mapping.

### Remotes & Multi-Push
- `gb rem ls`: List remotes for current repository.
- `gb rem add <name> <url> [-a <accountId>]`: Add remote with automatic SSH host alias routing.
- `gb push [target] [--all] [--tags] [-f]`: Push active branch across configured remotes concurrently.

### System Integration & Native Git Override
- `gb enable`: Inject GitBridge managed blocks into `~/.gitconfig` and `~/.ssh/config`.
- `gb disable`: Safely remove GitBridge managed blocks and restore backups.
- `gb override enable`: Install shims in `~/.gitbridge/shims` and inject PATH into shell profiles (`.bashrc`, `.zshrc`, `config.fish`, PowerShell).
- `gb override disable`: Remove shims and clean shell profiles.
- `gb override status`: Check shim status and active shell integration.
- `gb ide sync`: Automatically configure `git.path` and environment variables in detected IDEs (VS Code, Cursor, Antigravity, JetBrains).
- `gb ide unsync`: Restore original IDE Git settings.
- `gb ide status`: Check IDE synchronization status across all installed editors.

---

## 6. Development & Verification Commands

Use **Bun** as the primary runtime and test runner:

```bash
# Run complete test suite (unit + integration)
bun test

# Run specific test file
bun test tests/unit/identity-resolver.test.ts

# Run with test coverage
bun test --coverage

# Typecheck codebase without emitting files
bun run typecheck

# Build distribution bundles into dist/
bun run build

# Run local CLI binary directly
bun run bin/gb.ts --help
bun run bin/gb.ts st
```

---

## 7. Guidelines for AI Assistants

When developing, testing, or debugging GitBridge:
1. **Never mutate the user's live Git/SSH environment directly during tests**: Always instantiate `ConfigStore` with an isolated temporary directory via `PathResolver(tmpDir)` or set `GITBRIDGE_HOME=/tmp/test-gitbridge`.
2. **Preserve Native Git Interoperability**: Any change to `src/core/git/` or `src/core/ssh/` must ensure standard `git` and `ssh` commands remain 100% compliant with native Git/SSH behavior.
3. **Respect Progressive Disclosure**: For detailed operational workflows, refer to the Antigravity Skill at [`.agents/skills/gitbridge/SKILL.md`](file:///.agents/skills/gitbridge/SKILL.md) and reference documents in [`.agents/skills/gitbridge/references/`](file:///.agents/skills/gitbridge/references/).
