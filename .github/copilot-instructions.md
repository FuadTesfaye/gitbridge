# GitHub Copilot & OpenAI Codex Instructions for GitBridge

## Architecture & Codebase Summary
GitBridge is a cross-platform Git context manager written in TypeScript running on Bun.
It maps repositories to identities (name, email, signing key), accounts (tokens in OS Keyrings), and providers (GitHub, GitLab, Bitbucket) with zero runtime wrapper overhead using native `includeIf` and `~/.ssh/config`.

## CLI Command Patterns
- Dual binaries: `gitbridge` and `gb`.
- Repository Pinning: `gb repo set [path] [--identity <id>] [--email <email>] [--provider <provider>] [--account <accountId>]`
- Status & Diagnostics: `gb st`, `gb ctx`, `gb explain`, `gb cur`, `gb doc`.
- Security Suite: `gb sec check`, `gb sec fix`, `gb sec scan`.
- Identity CRUD: `gb id ls`, `gb id add`, `gb id edit`, `gb id rm`, `gb id use`.
- Provider Accounts: `gb acc ls`, `gb acc rm`, `gb auth login`, `gb auth logout`.
- Directory Rules: `gb rules ls`, `gb rules add`, `gb rules rm`.

## Code Conventions
- Strict TypeScript with Zod schemas for all configs (`src/core/config/schema.ts`).
- Secure storage abstraction (`StoreFactory`) supporting Linux Secret Service (`secret-tool`), macOS Keychain (`security`), Windows DPAPI (`cmdkey`), and fallback `EncryptedVault` (AES-256-GCM with hardware-bound PBKDF2).
- Zero leaks: All tokens masked with `redactSecret` in output. Strict `0700` directories and `0600` file permissions.
- Test runner: `bun test` (all unit and integration tests under `tests/`).
