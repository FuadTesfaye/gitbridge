# GitBridge Troubleshooting & Diagnostics Runbook

This guide covers common operational issues, diagnostic procedures, error messages, and recovery steps.

---

## 1. Quick Diagnostics

Whenever unexpected behavior occurs, run these two diagnostic commands first:

```bash
# 1. Check system health and provider connectivity
gb doc

# 2. Check resolved context for the active repository/folder
gb ctx
```

---

## 2. Common Scenarios & Resolutions

### Scenario A: Identity Mismatch Warning on `git commit`
**Symptoms**:
```text
[GitBridge Safety Warning] Mismatched Git commit identity!
Current: 'old@user.com', Expected: 'alice@workcorp.com' (Alice WorkCorp)
```

**Cause**:
The local repository has a sticky `user.email` configured in `.git/config` that contradicts the directory rule in `config.json`.

**Resolution**:
1. Run `gb ctx` to inspect the mismatch.
2. To align the local repository with the expected identity:
   ```bash
   # Remove local repository email override so directory rule applies:
   git config --unset user.email
   git config --unset user.name

   # Or explicitly switch this repo to the desired identity:
   gb sw <identityId>
   ```
3. If using the VS Code / Cursor / Antigravity extension, click **"Fix Repository Email Mismatch"** in the status bar menu.

---

### Scenario B: `Permission denied (publickey)` on Git Remote Operations
**Symptoms**:
```text
git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.
```

**Cause**:
SSH is offering the default SSH key instead of the key associated with your provider account, or the SSH host alias is missing.

**Resolution**:
1. Check that GitBridge integration is enabled in SSH:
   ```bash
   gb enable
   ```
2. Verify that your SSH config includes the generated GitBridge block:
   ```bash
   cat ~/.ssh/config
   # Should contain: Include ~/.gitbridge/generated/ssh_config
   ```
3. Check that your account is registered with the correct key:
   ```bash
   gb acc ls
   ```
4. If needed, update the remote URL to use the routed host alias:
   ```bash
   # e.g., git remote set-url origin git@github.com-work:myorg/myrepo.git
   gb rem add origin git@github.com:myorg/myrepo.git -a <accountId>
   ```

---

### Scenario C: Native Git Override is Not Intercepting Commands
**Symptoms**:
Running `which git` points to `/usr/bin/git` instead of `~/.gitbridge/shims/git`.

**Cause**:
The current shell session has not loaded the updated `$PATH`, or another tool (e.g. Homebrew, ASDF, Mise) is prepending to `$PATH` after `.bashrc` / `.zshrc`.

**Resolution**:
1. Check override status:
   ```bash
   gb override status
   ```
2. Reload shell configuration in the current session:
   ```bash
   # Bash
   source ~/.bashrc

   # Zsh
   source ~/.zshrc

   # Fish
   source ~/.config/fish/config.fish
   ```
3. Verify that `~/.gitbridge/shims` appears before `/usr/bin` in `$PATH`:
   ```bash
   echo $PATH
   ```

---

### Scenario D: System Keyring Unavailable / Headless Server
**Symptoms**:
```text
Cannot autolaunch D-Bus without X11 $DISPLAY
libsecret error: No such secret item
```

**Cause**:
Headless Linux environments, SSH servers, or Docker containers often lack a running Freedesktop Secret Service daemon.

**Resolution**:
GitBridge automatically falls back to `EncryptedVault` stored at `~/.gitbridge/vault.enc`.
- To enforce the encrypted vault explicitly, ensure `fallbackEncryptedStore: true` is configured in `settings`.
- You can supply an optional master password via the `GITBRIDGE_VAULT_PASSWORD` environment variable.

---

### Scenario E: Complete Rollback / Clean Uninstall
**To completely disable GitBridge integrations without losing your profiles:**

```bash
# 1. Disable Git & SSH config blocks
gb disable

# 2. Deactivate shell override shims
gb override disable

# 3. Restore IDE settings
gb ide unsync
```

This restores your original `~/.gitconfig`, `~/.ssh/config`, shell profiles, and IDE settings. Your configuration data in `~/.gitbridge` remains intact.

---

## 3. Developing & Testing in Isolation

When testing GitBridge features or writing automated tests, **never** manipulate the host user's actual `~/.gitconfig` or `~/.ssh/config`.

Use an isolated temporary environment:

```bash
# Set isolated environment variables
export GITBRIDGE_HOME="/tmp/gitbridge-sandbox"
mkdir -p "$GITBRIDGE_HOME"

# Run commands in complete isolation
bun run bin/gb.ts id add --id test --name "Test User" --email "test@example.com"
bun run bin/gb.ts st

# Clean up sandbox
rm -rf "$GITBRIDGE_HOME"
```
