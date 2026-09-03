# GitBridge CLI Cheat Sheet & Command Matrix

GitBridge ships with two CLI commands:
- `gitbridge`: Full command name
- `gb`: Concise shorthand alias

All commands, subcommands, and flags are identical between `gitbridge` and `gb`.

---

## 1. Top-Level Commands & Shorthands

| Shorthand | Full Command | Options & Flags | Description |
|---|---|---|---|
| `gb setup` | `gitbridge setup` | None | Interactive wizard to configure identities, providers, and rules |
| `gb st` | `gitbridge status` | None | Display configured identities, accounts, directory rules, and system state |
| `gb ctx` | `gitbridge context` | None | Inspect resolved Git author, matching rule, remotes, and warnings for current directory |
| `gb sw [id]` | `gitbridge switch [id]` | `-g, --global` | Switch active identity for the current repository or globally |
| `gb init` | `gitbridge init` | None | Initialize GitBridge profile and install pre-commit guard in current repo |
| `gb doc` | `gitbridge doctor` | None | Run system health, keyring, SSH key, and provider connectivity diagnostics |
| `gb enable` | `gitbridge enable` | None | Inject managed include blocks into `~/.gitconfig` and `~/.ssh/config` |
| `gb disable` | `gitbridge disable` | None | Remove managed blocks and restore original Git/SSH configurations |

---

## 2. Identity Management (`gb id` / `gitbridge identity`)

| Command | Shorthand | Description & Examples |
|---|---|---|
| `gb id ls` | `gb id list` | List all configured identities with default marker and signing keys |
| `gb id add` | `gb id add` | Create a new Git identity: <br>`gb id add --id work --name "Fuad Work" --email "fuad@workcorp.com" --signing-key "ssh-ed25519 AAAAC3..."` |
| `gb id use <id>` | `gb id use <id>` | Set `<id>` as the global fallback identity: <br>`gb id use personal` |
| `gb id rm <id>` | `gb id remove <id>` | Remove identity definition from `identities.json` |

---

## 3. Account & Authentication (`gb acc`, `gb auth`)

| Command | Shorthand | Description & Examples |
|---|---|---|
| `gb acc ls` | `gb acc list` | List authenticated provider accounts and linked SSH keys |
| `gb acc rm <id>` | `gb acc remove <id>` | Delete an account record and remove its secret from OS keychain |
| `gb auth login [provider]` | `gb auth login` | Authenticate with GitHub, GitLab, or Bitbucket. <br>`gb auth login github --token <pat> --ssh-key ~/.ssh/id_work` |
| `gb auth logout <provider> [user]` | `gb auth logout` | Log out and revoke credentials from keychain |
| `gb prov ls` | `gb provider list` | List supported Git providers (GitHub, GitLab, Bitbucket) and their hosts |

---

## 4. Directory Rules (`gb rules` / `gitbridge rule`)

| Command | Shorthand | Description & Examples |
|---|---|---|
| `gb rules ls` | `gb rules list` | List all directory mapping rules |
| `gb rules add <path> <id>` | `gb rules add` | Map a folder path to an identity: <br>`gb rules add ~/work/ work --provider github --account work-gh` |
| `gb rules rm <idOrPath>` | `gb rules remove` | Delete a directory rule by its ID or path |

---

## 5. Remotes & Push (`gb rem`, `gb push`)

| Command | Shorthand | Description & Examples |
|---|---|---|
| `gb rem ls` | `gb rem list` | List all remotes configured in the current repository |
| `gb rem add <name> <url>` | `gb rem add` | Add remote with optional account SSH alias routing: <br>`gb rem add mirror git@gitlab.com:org/repo.git -a work-gl` |
| `gb push [remoteOrProvider]` | `gb push` | Push active branch to specified remote or multiple providers: <br>`gb push --all` (pushes to all configured remotes concurrently) |

---

## 6. Native Git Override (`gb override`)

| Command | Description |
|---|---|
| `gb override enable` | Install cross-platform shims in `~/.gitbridge/shims/git` and update shell profiles (`.bashrc`, `.zshrc`, `config.fish`, PowerShell `$PROFILE`) |
| `gb override disable` | Remove shims and clean shell profiles |
| `gb override status` | Check shim installation status and whether shims are in current `$PATH` |

---

## 7. IDE Integration Sync (`gb ide`)

| Command | Description |
|---|---|
| `gb ide sync` | Configure `git.path` and terminal environment across all detected editors (VS Code, Cursor, Antigravity IDE, JetBrains) |
| `gb ide unsync` | Remove GitBridge modifications from IDE `settings.json` files |
| `gb ide status` | Show table of detected IDE installations and synchronization status |

---

## 8. Internal Bridge Commands

These commands are called automatically by Git or system hooks:

| Command | Invoked By | Description |
|---|---|---|
| `gb credential get\|store\|erase` | Native Git CLI | Responds to Git's standard credential helper protocol via OS keychains |
| `gb hook pre-commit` | Git hook (`.git/hooks/pre-commit`) | Verifies current commit author matches expected directory identity |
| `gb git-proxy [args...]` | GitBridge shim (`~/.gitbridge/shims/git`) | Proxies git commands with auto-injected author and SSH credentials |

---

## 9. Environment Variables

| Variable | Default Value | Purpose |
|---|---|---|
| `GITBRIDGE_HOME` | `~/.gitbridge` | Custom base directory for GitBridge configs and generated files |
| `XDG_CONFIG_HOME` | `~/.config` | Used when `GITBRIDGE_HOME` is unset (`$XDG_CONFIG_HOME/gitbridge`) |
| `GITBRIDGE_OVERRIDE_BYPASS` | unset | Set to `1` to prevent recursive shim proxying |
| `GITBRIDGE_REAL_GIT` | Auto-detected | Path to the true underlying system `git` binary |
| `GITBRIDGE_VAULT_PASSWORD` | unset | Optional password override for AES-256-GCM vault |
