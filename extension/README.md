# GitBridge for VS Code, Cursor & Antigravity IDE 🌉

> **Universal Git Identity & Multi-Account Management Layer**
> Never commit with the wrong email or push with the wrong Git account again.

---

## ✨ Features

- 👤 **Status Bar Identity Widget**: Always displays the currently resolved Git commit identity (`$(person) personal: Fuad Tesfaye` or `$(person) work@company.com`) and provider account (`$(github) @fuad-corp`).
- 🔄 **One-Click Identity Switcher**: Click the status bar item or run `GitBridge: Switch Git Identity` to switch between personal, work, client, or open-source identities on the fly.
- 📁 **GitBridge Explorer (Sidebar)**:
  - **Active Context View**: Shows active repository, resolved identity, directory rule match, target account, and remotes.
  - **Identities View**: List of all configured identities with active badges.
  - **Accounts & Providers View**: Connected accounts on GitHub, GitLab, and Bitbucket with status.
  - **Directory Rules View**: Visual mapping of folder paths to Git identities.
- ⚠️ **Commit Identity Safety Alert**: Displays a warning in the status bar and explorer if your local `.git/config` committer email mismatches the directory rule.
- 🚀 **Multi-Remote Push**: One-click action to push your current branch to multiple remotes in parallel.
- 🩺 **Built-In Diagnostics**: Run `GitBridge: Run System Diagnostics (Doctor)` to inspect Git version, Keychain health, SSH keys, and provider connectivity inside your editor.

---

## 🖥️ Compatibility

Compatible across all modern VS Code-based editors:
- **Visual Studio Code** (v1.85+)
- **Cursor IDE**
- **Windsurf**
- **Google Antigravity IDE**
- **VSCodium**

---

## ⌨️ Command Palette Reference

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and type `GitBridge`:

| Command | Description |
|---|---|
| `GitBridge: Switch Git Identity` | Quickly switch active Git identity (workspace or global) |
| `GitBridge: Initialize Repository Profile` | Configure GitBridge for the currently open repository |
| `GitBridge: Add Git Identity` | Create a new Git commit identity |
| `GitBridge: Add Directory Rule` | Map a folder path to an identity |
| `GitBridge: Connect Git Provider Account` | Connect GitHub, GitLab, or Bitbucket account |
| `GitBridge: Disconnect Account` | Remove an account and clear credentials from OS keychain |
| `GitBridge: Push to All Remotes` | Push current branch simultaneously to all configured remotes |
| `GitBridge: Run System Diagnostics (Doctor)` | View detailed health report in Output panel |
| `GitBridge: Enable Git Integration` | Activate `includeIf` and `credential.helper` |
| `GitBridge: Disable Git Integration` | Safely restore original Git settings |
| `GitBridge: Refresh Explorer` | Refresh status bar and sidebar views |

---

## ⚙️ Extension Settings

| Setting | Default | Description |
|---|---|---|
| `gitbridge.statusBar.enabled` | `true` | Show active GitBridge identity badge in the status bar |
| `gitbridge.statusBar.showEmail` | `true` | Display email alongside identity name in status bar |
| `gitbridge.safety.warnOnMismatch` | `true` | Show a warning when local repo email does not match directory rule |

---

## 🔒 Security & Privacy

- **100% Local**: GitBridge operates exclusively on your machine with **zero telemetry, zero cloud tracking, and no external servers**.
- **Hardware-Backed Keychains**: All access tokens are stored directly in your OS native secure storage (**Linux Secret Service / Keyring**, **macOS Keychain**, or **Windows Credential Manager**).

---

## 📄 License

MIT © Fuad Tesfaye
