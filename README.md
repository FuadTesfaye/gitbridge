# GitBridge 🌉

[![npm version](https://img.shields.io/npm/v/@fuad24/gitbridge.svg)](https://www.npmjs.com/package/@fuad24/gitbridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-63%20passed-brightgreen.svg)](https://github.com/FuadTesfaye/gitbridge/actions)

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

### Global Installation via npm
```bash
npm install -g @fuad24/gitbridge
```

### Global Installation via Bun
```bash
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

## 6. Signature Capabilities

### 1. Smart Clone (`gb clone`)
Clones any Git URL, auto-detects the provider, matches the correct account, sets up author identity, and installs the safety hook automatically:
```bash
gb clone git@gitlab.com:company/api.git
```

### 2. Decision Tree Diagnostics (`gb explain`)
Ever wonder why a commit used a specific email? `gb explain` walks the 5 resolution tiers:
```text
  GITBRIDGE DECISION TREE (WHY?)
  ──────────────────────────────────────────────────
  Directory:        /home/fuaf24/Insa/project
  
  Resolution Hierarchy Analysis:
    ○ Tier 1: Local Repository Config (.git/gitbridge.json) (skipped)
    ○ Tier 2: Repository Profile (repos.json) (skipped)
    ✔ Tier 3: Directory Rule (rule_Insa)
      Path pattern: ~/Insa (expanded: /home/fuaf24/Insa)
      Won via longest-prefix path match among 2 configured rule(s).
      Mapped to identity ID: 'insa'
    ○ Tier 4: Global Default Identity (skipped)

  Final Resolved Outcomes:
    • Identity:          Fuad Tesfaye <fuadt@insa.gov.et>
    • Provider Account:  GITLAB (fuadt)
    • SSH Key:           /home/fuaf24/.ssh/id_ed25519
```

### 3. Machine-Readable Context (`gb ctx --json`)
Ideal for CI scripts, terminal prompts, and IDE integrations:
```bash
gb ctx --json
```

### 4. Shell Prompt & Autocompletion Integration
Add GitBridge context directly to your shell prompt:
```bash
# In ~/.bashrc or ~/.zshrc:
export PS1="\u@\h:\w \$(gb current --prompt)\$ "

# Generate shell completions:
eval "$(gb completion bash)"   # or zsh / fish
```

### 5. Shell Environment Exporter (`gb env`)
Export environment variables for scripts or third-party Git tools:
```bash
eval "$(gb env)"
```

### 6. SSH Key Management & Account Aliasing (`gb ssh`)
Generate modern ed25519 keys and associate them with provider accounts:
```bash
# List discovered keys and linked accounts
gb ssh ls

# Generate a new SSH key
gb ssh generate --name id_ed25519_work --email "fuad@company.com"

# Link key to a specific account
gb ssh link ~/.ssh/id_ed25519_work gitlab_fuadt
```

### 7. Pre-Commit Identity Guard & Safety Mode
Prevents committing with personal email inside a company repository:
```bash
gb init
```
If your repository's local Git email conflicts with your GitBridge rule, commits and pushes are blocked with a clear warning:
```text
⚠ [GitBridge Safety Warning] Mismatched Git commit identity!
  Current:  'personal@gmail.com'
  Expected: 'fuad@company.com' (Fuad Work)
```

---

## 7. CLI Command Matrix

| Shorthand | Full Command | Arguments & Options | Description |
|---|---|---|---|
| `gb setup` | `gitbridge setup` | `-q, --quick` | Progressive onboarding wizard; `--quick` sets up in 1 second |
| `gb st` | `gitbridge status` | None | Overall status (identities, accounts, rules, integrations) |
| `gb ctx` | `gitbridge context` | `--json` | Inspect resolved identity context for current directory |
| `gb explain` | `gitbridge explain` | None | Decision tree breakdown of WHY an identity was chosen |
| `gb cur` | `gitbridge current` | `-p, --prompt`, `--email`, `--name` | Print active identity or compact prompt badge |
| `gb clone` | `gitbridge clone` | `<url> [dir] [--profile <id>]` | Smart clone with provider detection & identity setup |
| `gb sw [id]` | `gitbridge switch [id]` | `-g, --global` | Switch active identity locally or globally |
| `gb env` | `gitbridge env` | None | Print shell exports (`GIT_AUTHOR_NAME`, etc.) |
| `gb init` | `gitbridge init` | None | Initialize repo profile and install pre-commit guard |
| `gb repo set` | `gb repo set` | `[path] [-i id] [-e email] [-p prov] [-a acc]` | Bind repo permanently to identity, email, and provider |
| `gb repo ls` | `gb repo list` | None | List remembered repository profiles |
| `gb repo rm` | `gb repo unset` | `[path]` | Remove repository binding |
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
| `gb ide` | `gb ide` | `sync \| unsync \| status` | Sync Git path & terminal env with VS Code / Cursor |
| `gb completion`| `gb completion` | `[bash \| zsh \| fish]` | Generate shell autocompletion script |

---

## 8. Development & Testing

GitBridge is written in **TypeScript** and runs natively on **Bun**:

```bash
# Run complete test suite (63 unit & e2e tests)
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
