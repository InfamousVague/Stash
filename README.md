<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Stash icon" />
</p>

<h1 align="center">Stash</h1>

<p align="center">
  Your <code>.env</code> files deserve a bodyguard.
</p>

<p align="center">
  <a href="https://github.com/InfamousVague/Stash/releases/latest">
    <img src="https://img.shields.io/github/v/release/InfamousVague/Stash?style=flat-square&color=blue" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-lightgrey?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
</p>

---

Stash is a native desktop app for managing, encrypting, and sharing `.env` files across your projects and team. Built with [Tauri 2](https://v2.tauri.app), React 19, and Rust.

## Why Stash?

- **Encrypted at rest** — AES-256-GCM encryption with Argon2id key derivation. Your secrets never sit in plaintext.
- **Touch ID unlock** — macOS Keychain integration for fast, secure access.
- **Team sharing** — X25519 ECDH public-key crypto so each team member gets their own encrypted copy. No shared master password.
- **Profile support** — Manage `.env.development`, `.env.staging`, `.env.production` side by side with visual diffs.
- **Lock file sync** — `.stash.lock` tracks encrypted state across the team with push/pull controls and per-profile sync status.
- **Pull conflict resolution** — Preview incoming changes, selectively accept per-key, and auto-backup before merging.
- **CLI companion** — 12 commands (`pull`, `push`, `switch`, `run`, `diff`, `export`, and more) for terminal workflows and CI.
- **Key health monitoring** — Staleness, format validation, git exposure checks, and expiry tracking at a glance.
- **600+ API directory** — Look up env var names, portal links, and docs for popular services.
- **OTA updates** — Signed auto-updates with in-app download progress and one-click relaunch.
- **15 languages** — i18n out of the box.

## Features

### Vault Management
Every project gets its own encrypted vault. Scan your filesystem to auto-discover existing `.env` files, create new ones from framework templates, or bulk import variables by pasting `KEY=VALUE` lines or dropping a file.

### Team Collaboration
The **People** page unifies contacts and team members in one view. Share your public key via deep link (`stash://add-contact`), add teammates, and manage project access from a single screen. A **Share Wizard** guides first-time setup through identity confirmation, member addition, and lock initialization in three steps.

### Pull Conflict Resolution
When teammates push changes, the **Pull Preview** dialog shows a per-profile diff — added keys (green), removed keys (red), and changed values (yellow) — with checkboxes to selectively accept. A backup is created before every merge.

### Single-Variable Sharing
Share individual secrets directly from the env editor. Click the share button on any row, pick a recipient, and a `stash://import-var` deep link with the encrypted value is copied to your clipboard.

### Key Health & Expiry
The Health page monitors staleness (30/90-day thresholds), validates key formats (AWS, Stripe, GitHub, Slack, etc.), detects git exposure, and tracks expiry dates. A nav badge surfaces critical issues at a glance.

### Import & Export
- **Bulk import** — Paste or drag-and-drop `.env` file contents. Preview parsed variables with checkboxes before importing.
- **`.env.example` export** — Generate a safe-to-commit template with keys but no values.
- **Clipboard detection** — Pasting an API key auto-detects the service (AWS, Stripe, GitHub, OpenAI, etc.) and prompts to save to vault.

### Project Organization
Tag projects for quick filtering. Add tags inline from the vault list, then filter by tag to focus on what matters.

### Lock File Changelog
A collapsible **Recent Activity** section in the lock panel shows the git history of `.stash.lock` — who changed what and when.

### Deep Links
| Protocol | Action |
|----------|--------|
| `stash://add-contact?name=...&key=...` | Add a teammate |
| `stash://import-var?key=...&enc=...&from=...` | Import an encrypted variable |
| `stash://import-key?service=...&envKey=...` | Import an API key |

## Install

Download the latest `.dmg` from [**Releases**](https://github.com/InfamousVague/Stash/releases/latest), open it, and drag Stash to Applications. The app is signed and notarized by Apple.

## Build from source

**Prerequisites:** Node.js 18+, Rust 1.77+, Xcode Command Line Tools

```bash
# Clone
git clone https://github.com/InfamousVague/Stash.git
cd Stash

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build a release
npm run tauri build
```

## Project Structure

```
src/                    React frontend (Vite + TypeScript + React 19)
  pages/                Page-level components (Vaults, People, Health, etc.)
  components/           Shared UI components (EnvEditor, ShareWizard, etc.)
  hooks/                Custom hooks (useProjects, usePeople, useVault, etc.)
  utils/                Pure utility functions (validation, formatting)
  constants/            Static config (navigation, tour definitions)
  locales/              i18n translation files (15 languages)
  contexts/             React context providers (Toast)
  types.ts              Shared TypeScript interfaces

src-tauri/              Rust backend (Tauri 2)
  src/commands/         IPC command handlers
    team.rs             Lock file, encryption, pull/push, changelog
    projects.rs         Project CRUD, import, tags, .env.example
    health.rs           Key health checks, expiry, git scanning
    vault.rs            Master vault encryption / Touch ID
    profiles.rs         Profile switching and symlinks
    contacts.rs         Contact management
    saved_keys.rs       Saved key storage
  src/state.rs          App state (projects, rotation, expiry)
  src/config.rs         User preferences (profile colors)
  src/session.rs        Session management with secure file permissions
  src/env_parser.rs     .env file reading/writing
  src/team.rs           Crypto primitives (X25519, AES-256-GCM)
  src/profile_manager.rs Profile symlink management
  src/scanner.rs        Filesystem .env discovery
  src/helpers.rs        Shared path and utility helpers
  src/bin/              CLI companion binary
```

## Security

| Layer | Implementation |
|-------|---------------|
| Vault encryption | AES-256-GCM + Argon2id KDF |
| Team sharing | X25519 ECDH key agreement + per-member encryption |
| Key storage | macOS Keychain (Touch ID) |
| Session files | Unix permissions `0o600` |
| Lock format | `.stash.lock` v2 with per-profile encrypted blobs |

Private keys never leave the local machine. The `.stash.lock` file is safe to commit — it contains only encrypted data and public key metadata.

## CLI

```bash
$ stash pull              # Decrypt .stash.lock → .env files
$ stash push              # Encrypt .env files → .stash.lock
$ stash switch staging    # Switch active profile
$ stash run -- npm start  # Run with decrypted env injected
$ stash diff              # Compare profiles side by side
$ stash export            # Generate .env.example
```

Install the CLI from Settings or run:
```bash
# The app installs the CLI to /usr/local/bin/stash
```

## License

MIT
