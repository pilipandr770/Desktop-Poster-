# Changelog

All notable changes to CrossPost Desktop are documented here.

---

## [0.2.0-beta] — 2026-06-24

### Added
- **Pipeline Crossposting** — new `PipelinePost` component: create a post once and publish it step-by-step to multiple platforms with per-platform customisation
- **Twitter/X support** — connect Twitter/X accounts via Tweepy; post content and read DMs
- **Telegram improvements** — full OTP two-step authentication flow; post to groups and channels
- **System tray** — minimise to tray on window close; push notifications for new messages
- **Start minimised** — option to launch app hidden in tray
- **Sync interval setting** — configurable background message-sync interval in Settings
- **Quit button** in sidebar
- **Auto-updater** — `tauri-plugin-updater` integration for in-app updates
- **Meta OAuth** — Instagram & Facebook connection via OAuth flow
- **German landing page** — deployed via GitHub Pages with auto-updating download URL
- **Legal pages** — Impressum, Datenschutz, AGB

### Fixed
- DNS resolution in Rust before passing host to Python subprocess (fixes IMAP/SMTP in Tauri sandbox)
- Email IMAP auth errors — better diagnostics + Gmail App-Password hint
- Sidecar JSON parsing edge cases + clickable help links via opener
- `plugin-opener` import replaced with `invoke open_external_url`
- Node.js install button opens browser instead of running winget
- WhatsApp error state shows Node.js install button
- Tray init errors no longer crash app startup
- Startup hide race condition removed
- Python `socket.getaddrinfo` monkey-patch replaced with `_create_socket` override

### Changed
- Complete UI overhaul — sidebar, layout, forms, cards, inbox, crosspost pages (Catppuccin Mocha)
- CI: signing key is now optional in release workflow

---

## [0.1.0-beta] — 2026-06-19

### Added
- Initial beta release
- Tauri 2 + React 18 + Python 3.11 architecture
- Unified Inbox (Instagram, Facebook, LinkedIn, Twitter/X, Telegram, Email)
- Mirror crossposting (`MirrorPost`) and AI content generation (`AICreatePost`)
- Python sidecar via stdin/stdout JSON lines
- SQLite local database (DSGVO-konform)
- WhatsApp via Evolution API / Baileys (QR code flow)
- Scheduler, session caching, media file dialog
- License activation (Solo / Pro / Agency plans)
- GitHub Actions release pipeline + Windows installer
