# GitBridge - Claude Code Guide & Context

This file provides project architecture, CLI command references, and development guidelines for **Claude Code** and Anthropic Claude models.

---

## 1. Project Mission & Architecture

**GitBridge** is a cross-platform Git context manager that automatically maps a repository to the correct Git identity, provider account, credentials, and SSH configuration while preserving the standard native Git workflow.

### The Three Independent Layers
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

- **Context Engine**: Maps `repository -> remote -> provider -> account -> identity -> SSH credentials`.
- **Zero Runtime Overhead**: Integrates natively via Git `includeIf`, `credential.helper`, and `~/.ssh/config`.
- **Security First**: Uses OS Keyrings (Linux Secret Service, macOS Keychain, Windows DPAPI) with hardware-bound AES-256-GCM vault fallback, plus pre-commit/pre-push secret scanning guards.

---

## 2. Common User Intent -> CLI Command Mapping

When a user asks Claude to perform an action, use these exact commands:

| Request | Command | Description |
|---|---|---|
| Install GitBridge (1-liner for Linux/macOS) | `curl -fsSL https://cdn.jsdelivr.net/gh/FuadTesfaye/gitbridge@main/install.sh \| bash` | Universal installer |
| Install GitBridge (Windows PowerShell) | `irm https://cdn.jsdelivr.net/gh/FuadTesfaye/gitbridge@main/install.ps1 \| iex` | PowerShell installer |
| Set this repo to an email & provider | `gb repo set . -i <id> -p <prov>` | Binds repo permanently without asking again |
| Check active repository context | `gb context` (`gb ctx`) | Displays repository, remote, provider, account, identity, SSH |
| Why was this email/identity chosen? | `gb explain` | Explains decision tree across the 5 resolution tiers |
| Switch active identity | `gb switch <id>` | Switches identity locally or globally (`-g`) |
| Show status & identities | `gb status` / `gb id ls` | Lists identities, accounts, rules |
| Add new commit identity | `gb id add --id <id> --name "<n>" --email "<e>"` | Registers commit author |
| Connect GitHub account | `gb auth login github -t <pat> --ssh-key ~/.ssh/id_ed25519` | Saves token in OS Keyring |
| Connect GitLab account | `gb auth login gitlab -u <user> -p <pass> --host <url>` | Supports cloud & self-hosted GitLab |
| Map directory tree to identity | `gb rules add <path> <id> [--account <acc>]` | Compiles native Git `includeIf` |
| List remembered repos | `gb repo ls` | Lists all pinned repositories |
| Run security audit | `gb sec check` | Audits permissions, keyrings, remotes, staged secrets |
| Auto-fix permissions & install hooks | `gb sec fix` | Locks permissions to 0700/0600 & installs safety hooks |
| Scan codebase for secrets | `gb sec scan [path]` | Scans for private keys, tokens, `.env` files |
| Run system diagnostics | `gb doctor` (`gb doc`) | Inspects Git CLI, SSH keys, provider APIs |
| Enable Git & SSH integration | `gb enable` | Writes managed blocks to `~/.gitconfig` and `~/.ssh/config` |
| Route native `git` through GitBridge | `gb override enable` | Installs shims and shell PATH integration |
| Sync with IDEs (VS Code, Cursor) | `gb ide sync` | Syncs `git.path` in editor settings |

---

## 3. Development Commands (Bun)

```bash
# Run tests
bun test

# Run specific test file
bun test tests/unit/repo-profile.test.ts

# Typecheck
bun run typecheck

# Build bundle
bun run build

# Run local binary
bun run bin/gb.ts --help
```

---

## 4. Coding & Architecture Rules

1. **Do not mutate live Git/SSH environment in tests**: Always use isolated test dirs via `PathResolver(tmpDir)`.
2. **Preserve native Git compatibility**: Ensure zero wrappers are required for standard Git operations.
3. **Strict permissions**: Always enforce `0700` on directories and `0600` on sensitive configuration files.
