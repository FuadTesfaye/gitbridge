# GitBridge 🌉

[![npm version](https://img.shields.io/npm/v/@fuad24/gitbridge.svg)](https://www.npmjs.com/package/@fuad24/gitbridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-88%20passed-brightgreen.svg)](https://github.com/FuadTesfaye/gitbridge/actions)

> **GitBridge is a cross-platform Git context manager that automatically maps a repository to the correct Git identity, provider account, authentication credentials, and SSH configuration while preserving the standard Git workflow.**

A developer should be able to move seamlessly across GitHub, GitLab, Bitbucket, multiple accounts, and multiple emails without constantly changing Git or SSH configurations manually. Everything in GitBridge exists to make that happen.

---

## 1. The Core Architecture: Three Separate Layers

In GitBridge, **Identity**, **Account**, and **Provider** are completely decoupled:

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
                  Native Git CLI
             (git commit, git push)
```

### Why This Separation Matters:
- **Email ≠ Provider Account**: Your commit identity `fuad@company.com` is distinct from your GitHub username `fuad-company` or GitLab handle `fuadt`.
- **An Identity can span multiple accounts**: You can use the same work identity across GitHub, GitLab, and Bitbucket.
- **Repositories determine the Context**: When you navigate into a repository, GitBridge asks:
  1. *Where am I?* (Repository root path)
  2. *What remote does it use?* (`origin` URL)
  3. *Which provider is that?* (GitHub, GitLab, or self-hosted instance)
  4. *Which account should access it?* (Provider username & secure token)
  5. *Which author identity should I use?* (Name & Email)
  6. *Which SSH credentials should authenticate it?* (Host alias & private key)
  7. *Are these all consistent and safe?* (Safety Mode / Mismatch check)

---

## 2. Design Principle: Discover Broadly, Configure Narrowly, Activate Lazily

GitBridge supports many platforms, but it **never forces you to configure providers you do not use**.

1. **Discover Broadly**: Inspects `~/.gitconfig`, `~/.ssh/config`, `~/.git-credentials`, and local repo remotes before asking any questions.
2. **Configure Narrowly**: Asks which providers you actually use, and only activates those.
3. **Activate Lazily**: When you navigate into a project using a new or self-hosted provider (e.g. `http://172.27.23.116`), GitBridge detects it on the spot and offers quick configuration.

---

## 3. Installation

### One-Line Install (Linux & macOS)
```bash
curl -fsSL https://cdn.jsdelivr.net/gh/FuadTesfaye/gitbridge@main/install.sh | bash
# Or directly from GitHub:
# curl -fsSL https://raw.githubusercontent.com/FuadTesfaye/gitbridge/main/install.sh | bash
```

### One-Line Install (Windows PowerShell)
```powershell
irm https://cdn.jsdelivr.net/gh/FuadTesfaye/gitbridge@main/install.ps1 | iex
# Or directly from GitHub:
# irm https://raw.githubusercontent.com/FuadTesfaye/gitbridge/main/install.ps1 | iex
```

### Global Installation via npm or Bun
```bash
npm install -g @fuad24/gitbridge
# or
bun add -g @fuad24/gitbridge
```

### Dual Binaries
GitBridge provides both `gitbridge` (verbose) and `gb` (fast shorthand):
```bash
gb --version
gitbridge --version
```

---

## 4. Quick Start

### Option A: 1-Second Instant Setup (`--quick`)
Scans your system tools, discovered SSH keys, and existing Git remotes, then applies optimal settings automatically:
```bash
gb setup --quick
```

### Option B: Guided Progressive Wizard
Interactive onboarding that configures only what you need:
```bash
gb setup
```

### Inspecting Your Active Context
```bash
# Check overall GitBridge status
gb st

# Inspect resolved identity and remote routing for the current directory
gb ctx

# Explain WHY GitBridge selected a particular identity (decision tree)
gb explain

# Get compact badge for shell prompts (e.g. "[GitLab:fuadt] [work]")
gb current --prompt
```

---

## 5. Daily Developer Workflow (Zero Friction)

### You keep using normal Git commands:
```bash
cd ~/Personal/my-side-project
git commit -m "feat: personal project update"
git push origin main
# → Commits as: Fuad Tesfaye <personal@gmail.com>
# → Pushes via: github.com SSH key

cd ~/Work/corporate-service
git commit -m "feat: company update"
git push origin main
# → Commits as: Fuad Tesfaye <fuad@company.com>
# → Pushes via: GitLab enterprise SSH key
```
**No wrappers, no environment variables, no manual `git config user.email` required.**

---

### 6. Signature Capabilities

### 1. Automated Repository Access Tracking & Smart Clone (`gb clone`)
When you clone a repository, GitBridge automatically determines **which authenticated account has access** to it:
1. **Namespace Match**: Automatically links repositories owned by your username (e.g. `fuadpersonal/project` -> `fuad@personal.me`).
2. **Provider API Probe**: Queries GitHub, GitLab, or Bitbucket APIs using your secured OS Keyring tokens to verify access permissions (`admin`, `write`, `read`).
3. **SSH Key Routing**: Selects and routes the exact SSH key linked to the account.
4. **Persistent Memory**: Writes `.git/gitbridge.json`, registers in `repos.json`, configures local Git `user.name` & `user.email`, and activates pre-commit safety hooks. **It remembers forever without asking again.**

```bash
# Smart clone with automated access tracking:
gb clone git@github.com:FuadTesfaye/gitbridge.git

# Clone with explicit identity, account, or email:
gb clone git@gitlab.com:company/api.git -i work -a gitlab_fuadt -e "fuad@company.com"
```

### 2. Workspace Directory Rule Inheritance (`gb rules add`)
Map your workspace directories to specific Git identities and provider accounts. Everything cloned or created inside that folder automatically inherits the profile:
```bash
# Map work folder:
gb rules add ~/work work --provider gitlab --account gitlab_work

# Map personal folder:
gb rules add ~/Personal personal --provider github --account github_personal
```
Now, whenever you clone or `git init` inside `~/work/client-api`, it is automatically configured for `work` without any prompts.

### 3. Persistent Repository Binding (`gb repo set`)
Lock any existing repository permanently to an identity, email, and provider:
```bash
# Pin repository to an identity:
gb repo set . --identity work

# Pin directly using an email:
gb repo set . --email "fuad@company.com" --provider gitlab

# List remembered repositories:
gb repo list
```

### 4. Decision Tree Diagnostics (`gb explain`)
Ever wonder why a commit used a specific email? `gb explain` walks the 6 deterministic resolution tiers:
```text
  GITBRIDGE DECISION TREE (WHY?)
  ──────────────────────────────────────────────────
  Directory:        /home/fuaf24/work/project
  Repository Root:  /home/fuaf24/work/project
  
  Resolution Hierarchy Analysis:
    ○ Tier 1: Local Repository Override (.git/gitbridge.json) (none found)
    ○ Tier 2: Repository Profile (repos.json) (none found)
    ✔ Tier 3: Directory Rule (rule_work)
      Path pattern: ~/work (expanded: /home/fuaf24/work)
      Won via longest-prefix path match among 2 configured rule(s).
      Mapped to identity ID: 'work'
    ○ Tier 4: Remote Repository Access Detection (skipped)
    ○ Tier 5: Global Default Identity (skipped)
    ○ Tier 6: System Git Fallback (skipped)

  Final Resolved Outcomes:
    • Identity:          Fuad Tesfaye <fuad@company.com>
    • Provider Account:  GITLAB (fuadwork)
    • SSH Key:           /home/fuaf24/.ssh/id_ed25519
    • Remote Provider:   GitLab (gitlab.company.com) - Configured
```

### 5. Transparent Native Git Override (`gb override enable`)
Want standard `git commit` and `git push` to use GitBridge context without typing `gb`?
```bash
# Enable native git override:
gb override enable

# Verify override status:
gb override status

# Safely disable and restore default behavior:
gb override disable
```
- **Strictly active only when enabled**: When disabled, the shim executes real native `git` with **0ms fast bypass**.
- **Transparent IDE Sync**: Run `gb ide sync` to configure `git.path` in VS Code, Cursor, and Antigravity automatically.

### 6. Built-in Security Audit & Auto-Remediation (`gb sec`)
Built-in security engine that protects against credential leaks and permission vulnerabilities:
```bash
# Run full security audit:
gb sec check

# Auto-remediate findings (lock permissions to 0700/0600, scrub remote tokens into Keyring, install hooks):
gb sec fix

# Deep-scan repository tree for leaked API tokens, private keys, or .env files:
gb sec scan [path]
```

### 7. Pre-Commit Identity Guard & Safety Mode
Prevents accidentally committing with personal email inside a company repository:
If your repository's local Git email conflicts with your verified GitBridge rule, commits and pushes are blocked with a clear warning:
```text
⚠ [GitBridge Safety Warning] Mismatched Git commit identity!
  Current:  'personal@gmail.com'
  Expected: 'fuad@company.com' (Fuad Work)
```

### 8. Machine-Readable Context (`gb ctx --json`)
Ideal for CI scripts, terminal prompts, and IDE integrations:
```bash
gb ctx --json
```

### 9. Shell Prompt & Autocompletion Integration
Add GitBridge context directly to your shell prompt:
```bash
# In ~/.bashrc or ~/.zshrc:
export PS1="\u@\h:\w \$(gb current --prompt)\$ "

# Generate shell completions:
eval "$(gb completion bash)"   # or zsh / fish
```

---

## 7. CLI Command Matrix

| Shorthand | Full Command | Arguments & Options | Description |
|---|---|---|---|
| `gb setup` | `gitbridge setup` | `-q, --quick` | Progressive onboarding wizard; `--quick` sets up in 1 second |
| `gb st` | `gitbridge status` | None | Overall status (identities, accounts, rules, integrations) |
| `gb ctx` | `gitbridge context` | `--json` | Inspect resolved identity context for current directory |
| `gb explain` | `gitbridge explain` | None | Decision tree breakdown across all 6 resolution tiers |
| `gb cur` | `gitbridge current` | `-p, --prompt`, `--email`, `--name` | Print active identity or compact prompt badge |
| `gb clone` | `gitbridge clone` | `<url> [dir] [-i id] [-a acc] [-e email]` | Smart clone with access auto-detection & persistent binding |
| `gb repo set` | `gb repo set` | `[path] [-i id] [-e email] [-p prov] [-a acc]` | Bind repo permanently to identity, email, and provider |
| `gb repo ls` | `gb repo list` | None | List remembered repository bindings |
| `gb repo rm` | `gb repo unset` | `[path]` | Remove repository binding |
| `gb sw [id]` | `gitbridge switch [id]` | `-g, --global` | Switch active identity locally or globally |
| `gb env` | `gitbridge env` | None | Print shell exports (`GIT_AUTHOR_NAME`, etc.) |
| `gb init` | `gitbridge init` | None | Initialize repo profile and install pre-commit guard |
| `gb doc` | `gitbridge doctor` | None | Run system, keyring, SSH, and provider health checks |
| `gb enable` | `gitbridge enable` | None | Inject managed include blocks into `~/.gitconfig` and `~/.ssh/config` |
| `gb disable` | `gitbridge disable` | None | Safely remove GitBridge integration blocks |
| `gb id ls` | `gb identity list` | None | List configured commit identities |
| `gb id add` | `gb identity add` | `--id <id> --name <n> --email <e>` | Register new commit author identity |
| `gb id rm` | `gb identity remove` | `<id>` | Delete an identity |
| `gb acc ls` | `gb account list` | None | List authenticated provider accounts |
| `gb acc rm` | `gb account remove` | `<id>` | Delete account and erase token from OS keychain |
| `gb auth login` | `gb auth login` | `[provider] [-t token] [-u user -p pass] [--host h]` | Authenticate with GitHub, GitLab, or Bitbucket |
| `gb auth logout`| `gb auth logout` | `<provider> [username]` | Revoke credentials from OS secure storage |
| `gb prov ls` | `gb provider list` | None | List supported providers, active state, and capabilities |
| `gb prov enable`| `gb provider enable`| `<provider>` | Enable a provider for management |
| `gb prov disable`| `gb provider disable`| `<provider>` | Disable a provider (preserves stored credentials) |
| `gb rules ls` | `gb rule list` | None | List directory routing rules |
| `gb rules add` | `gb rule add` | `<path> <identityId> [--account <acc>]` | Map a workspace folder to an identity |
| `gb rules rm` | `gb rule remove` | `<idOrPath>` | Delete a directory rule |
| `gb ssh ls` | `gb ssh list` | None | List SSH keys in `~/.ssh` and linked accounts |
| `gb ssh gen` | `gb ssh generate` | `[--name <name>] [--email <email>]` | Generate new ed25519 SSH key |
| `gb ssh link` | `gb ssh link` | `[keyPath] [accountId]` | Link SSH key to an account |
| `gb sec check`| `gb security check` | None | Full security health audit (permissions, remotes, keyring, staged secrets) |
| `gb sec fix` | `gb security fix` | None | Auto-lock permissions to `0700/0600`, scrub remote tokens, install hooks |
| `gb sec scan`| `gb security scan` | `[path]` | Scan directory tree for private keys, API tokens, and `.env` files |
| `gb override` | `gb override` | `enable \| disable \| status` | Transparently intercept standard `git` binary |
| `gb ide` | `gb ide` | `sync \| unsync \| status` | Sync Git path & terminal env with VS Code / Cursor / Antigravity |
| `gb update` | `gitbridge update` | `[-c, --check] [-f, --force]` | Check for and install the latest GitBridge release from npm |
| `gb completion`| `gb completion` | `[bash \| zsh \| fish]` | Generate shell autocompletion script |

---

## 8. Development & Testing

GitBridge is written in **TypeScript** and runs natively on **Bun**:

```bash
# Run complete test suite (88 unit & e2e tests)
bun test

# Typecheck codebase without emitting
bun run typecheck

# Compile production bundles into dist/
bun run build

# Run local CLI binary directly
bun run bin/gb.ts --help
```

---

## 9. License

MIT License. Designed and crafted with precision for developers working across multiple Git universes.
