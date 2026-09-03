---
name: gitbridge
description: >-
  Manage Git identities, multi-account routing, SSH host aliases, directory rules, credential helpers, native git overrides, and IDE sync in GitBridge. Use when the user asks to configure or troubleshoot Git identities, multiple GitHub/GitLab accounts, SSH keys, repository commit author profiles, pre-commit guards, or develop/test the GitBridge codebase and companion extension.
---

# GitBridge Workspace Skill

This skill provides step-by-step procedures and runbooks for configuring, operating, and developing **GitBridge** (Universal Git Identity & Multi-Account Management Layer).

---

## Technical References

For deep architectural explanations and reference tables, refer to:
- [System Architecture & Component Sequence](./references/architecture.md)
- [CLI Cheat Sheet & Command Matrix](./references/cli-cheat-sheet.md)
- [Troubleshooting & Diagnostics Runbook](./references/troubleshooting.md)

---

## Procedure 1: Setting Up & Managing Git Identities

Use this workflow to configure distinct author profiles (e.g. Work, Personal, Open Source).

1. **List existing identities**:
   ```bash
   gb id ls
   ```
2. **Add a new identity**:
   ```bash
   # Add an identity with name, email, and optional signing key
   gb id add --id work --name "Fuad Work" --email "fuad@workcorp.com"
   
   # Add a personal identity and set it as global default
   gb id add --id personal --name "Fuad Tesfaye" --email "fuad@personal.me" --default
   ```
3. **Verify configuration**:
   ```bash
   gb st
   ```

---

## Procedure 2: Mapping Directory Rules for Automatic Identity Switching

GitBridge uses Git's native `includeIf "gitdir:..."` mechanism to dynamically switch identities based on file paths.

1. **Map a directory path to an identity**:
   ```bash
   # Map ~/work and all its subdirectories to the 'work' identity
   gb rules add ~/work/ work

   # Map ~/personal to the 'personal' identity
   gb rules add ~/personal/ personal
   ```
2. **Inject configuration into native Git**:
   ```bash
   gb enable
   ```
   *This compiles `~/.gitbridge/generated/main.gitconfig` and injects an `[include]` directive into `~/.gitconfig`.*
3. **Verify resolution in a target directory**:
   ```bash
   cd ~/work/any-project
   gb ctx
   ```
   *The output will confirm `source: directory_rule` with author `fuad@workcorp.com`.*

---

## Procedure 3: Configuring Multi-Account SSH Isolation

When using multiple accounts on the same Git provider (e.g. personal GitHub + corporate GitHub Enterprise), avoid SSH key collisions using isolated host aliases.

1. **Log in and register provider accounts with SSH keys**:
   ```bash
   # Authenticate personal account
   gb auth login github --token <personal_pat> --ssh-key ~/.ssh/id_personal

   # Authenticate work account
   gb auth login github --token <work_pat> --ssh-key ~/.ssh/id_work
   ```
2. **Verify generated SSH configuration**:
   ```bash
   gb enable
   cat ~/.gitbridge/generated/ssh_config
   ```
   *GitBridge creates distinct aliases:*
   - `Host github.com-personal` -> `IdentityFile ~/.ssh/id_personal`, `IdentitiesOnly yes`
   - `Host github.com-work` -> `IdentityFile ~/.ssh/id_work`, `IdentitiesOnly yes`
3. **Link directory rule to default account**:
   ```bash
   gb rules add ~/work/ work --account work
   ```
   *Git config will automatically rewrite remote URLs matching `git@github.com:` to `git@github.com-work:` using `insteadOf`.*

---

## Procedure 4: Activating Native Git Overrides & IDE Synchronization

To route standard `git` commands and IDE source control panels through GitBridge without wrappers:

1. **Enable Native Git Override**:
   ```bash
   gb override enable
   ```
   *This generates shims in `~/.gitbridge/shims/git` and injects PATH configuration into your shell profile.*
2. **Synchronize IDEs (VS Code, Cursor, Antigravity IDE, JetBrains)**:
   ```bash
   gb ide sync
   ```
   *Configures `git.path` in detected editor `settings.json` files and injects terminal environment variables.*
3. **Check status**:
   ```bash
   gb override status
   gb ide status
   ```

---

## Procedure 5: Pre-Commit Identity Guard & Mismatch Resolution

Prevent accidental commits with the wrong email (e.g. committing personal email to a corporate repo):

1. **Install safety hook in current repository**:
   ```bash
   gb init
   ```
   *Installs `.git/hooks/pre-commit` running `gitbridge hook pre-commit`.*
2. **Check for mismatches**:
   ```bash
   gb ctx
   ```
3. **Fix mismatch if flagged**:
   ```bash
   # Remove conflicting repository-level email override
   git config --unset user.email
   git config --unset user.name

   # Or switch explicit identity
   gb sw work
   ```

---

## Procedure 6: Developing, Testing & Verifying GitBridge Code

Follow these standards when contributing to or testing GitBridge:

1. **Run full automated test matrix**:
   ```bash
   bun test
   ```
2. **Typecheck without emitting**:
   ```bash
   bun run typecheck
   ```
3. **Compile production distribution**:
   ```bash
   bun run build
   ```
   *Outputs bundled executables to `dist/bin/gitbridge.js` and `dist/bin/gb.js`.*
4. **Isolate test environments**:
   Always use `GITBRIDGE_HOME=/tmp/test-gitbridge` or mock instances of `ConfigStore` during integration tests to prevent touching `~/.gitconfig` or `~/.ssh/config`.

---

## Procedure 7: Companion IDE Extension Development (`extension/`)

1. **Navigate to extension directory**:
   ```bash
   cd extension
   ```
2. **Install dependencies & build bundle**:
   ```bash
   bun install
   bun run build
   ```
3. **Package `.vsix` extension package**:
   ```bash
   bun run package
   ```
   *Produces `gitbridge-vscode-<version>.vsix` for installation in VS Code, Cursor, or Antigravity IDE.*

---

## Procedure 8: Selective Providers & Diagnostic Inspections

GitBridge uses a **selective-by-default** model (*"Discover broadly, configure narrowly, activate lazily"*).

1. **Quick Progressive Setup**:
   ```bash
   gb setup --quick
   ```
   *Automatically detects existing Git tools, SSH keys, active remotes, and configures only the providers found.*

2. **Managing Enabled Providers**:
   ```bash
   # List supported providers and their enabled/authenticated status
   gb prov ls

   # Enable a provider (e.g. GitLab)
   gb prov enable gitlab

   # Disable a provider (without erasing credentials)
   gb prov disable bitbucket
   ```

3. **Inspecting Resolution Decision Tree (Why was an identity chosen?)**:
   ```bash
   gb explain
   ```
   *Breaks down the 5-tier resolution ladder (Local Repo Config -> Repos Profile -> Directory Rule -> Global Default -> System Fallback).*

4. **Exporting Environment Variables for Shells / CI**:
   ```bash
   gb env
   # Evaluate directly in current shell session:
   eval "$(gb env)"
   ```

5. **Machine-Readable Context for IDEs & Scripts**:
   ```bash
   gb ctx --json
   ```

