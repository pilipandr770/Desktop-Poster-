# Changelog

All notable changes to CrossPost Desktop are documented here.

---

## [0.6.0-beta] — 2026-06-24

### Added
- **Gmail OAuth 2.0 PKCE** — ein Klick "Mit Google anmelden", Browser öffnet sich; Rust-Backend implementiert PKCE-Flow auf Port 8082; XOAUTH2-Login in Python EmailHandler (kein App-Passwort mehr für Gmail nötig)
- **Meta App Secret eingebettet** — META_APP_SECRET wird zur Build-Zeit aus GitHub Secrets eingebettet (gleiche Methode wie TWITTER_CLIENT_ID); Nutzer müssen keinen App-Secret manuell konfigurieren
- **Google Client ID eingebettet** — GOOGLE_CLIENT_ID wird zur Build-Zeit aus GitHub Secrets eingebettet
- **Gmail als eigene Plattform** — separates Gmail-Konto neben allgemeinem E-Mail für Outlook/GMX/etc.

### Changed
- Email-Plattform: Gmail entfernt, zeigt jetzt nur IMAP/SMTP für Nicht-Google-Anbieter
- `build.rs`: verarbeitet nun alle drei OAuth-Secrets (TWITTER_CLIENT_ID, META_APP_SECRET, GOOGLE_CLIENT_ID) in einer Schleife
- `release.yml`: META_APP_SECRET und GOOGLE_CLIENT_ID werden jetzt als Build-Umgebungsvariablen übergeben

---

## [0.5.0-beta] — 2026-06-24

### Added
- **Telegram vereinfacht** — nur noch Telefonnummer nötig; API ID / API Hash werden serverseitig zur Build-Zeit eingebettet (GitHub Secrets → PyInstaller → Binary)
- **Twitter OAuth 2.0 PKCE** — ein Klick "Mit Twitter verbinden", Browser öffnet sich, kein API-Key mehr nötig; Rust-Backend implementiert PKCE-Flow mit lokalem HTTP-Callback auf Port 8081
- **E-Mail Auto-Detect** — IMAP/SMTP-Server wird automatisch aus der Domain erkannt (Gmail, Outlook, Yahoo, GMX, web.de, t-online.de, iCloud etc.); keine manuellen Serveradressen mehr nötig
- **Twitter OAuth 2.0 Post-Support** — Posts über `oauth2_token` Bearer-Auth direkt an Twitter v2 API, kein Tweepy mehr nötig

### Changed
- Telegram-Verbindungsformular: api_id und api_hash entfernt (nur noch Telefonnummer)
- Twitter-Verbindungsformular: 4 API-Key-Felder ersetzt durch einen OAuth-Button
- E-Mail-Verbindungsformular: imap_host / smtp_host Felder entfernt (auto-detect)
- OAuth-Button-Design: Meta/Twitter/OAuth-Plattformen zeigen grünes "✅"-Badge statt gelber Warnung
- Version: 0.4.0 → 0.5.0

---

## [0.4.0-beta] — 2026-06-24

### Added
- **License plan enforcement** — `add_account` now reads the active plan from DB and enforces per-platform account limits: Solo=1, Pro=3, Agency=10. Returns a German error message if the limit is exceeded.
- **Plan badge in AccountsPage header** — shows current plan (Solo/Pro/Agency) and the max accounts per platform.
- **Per-platform slot indicators** — Pro/Agency users see `used/max` badges on each platform card (red when at limit).

### Changed
- Solo plan: adding an account for an existing platform updates it (same as before)
- Pro/Agency plan: multiple accounts per platform are now truly supported (no longer replaced)

---

## [0.3.0-beta] — 2026-06-24

### Added
- **Onboarding welcome screen** — shown on first launch with 3-step setup guide (connect account → activate license → first post)
- **Auto-update notification** — checks for updates on startup, shows toast with link to Settings
- **Pipeline media passthrough** — PipelinePost now forwards `media_url` from source post to all destination platforms

### Changed
- Sidebar version label updated to v0.2
- App version bumped to 0.3.0

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
