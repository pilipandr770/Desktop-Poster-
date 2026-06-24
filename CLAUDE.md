# CrossPost Desktop — Claude Code Context

## Что это за проект

Десктопное приложение (Tauri 2 + React 18 + Python 3.11) для немецкого SMB-рынка.
Unified Inbox + AI Crossposting. Все данные хранятся локально (DSGVO-конформно).

**Автор:** Andrii Pylypchuk, Frankfurt am Main  
**GitHub:** https://github.com/pilipandr770/Desktop-Poster-  
**Текущая версия:** 0.2.0-beta  
**Последний релиз:** v0.1.0-beta (19.06.2026)

---

## Архитектура

```
Tauri App (Rust shell)
├── React UI (фронтенд) — src/
├── Python sidecar — python-sidecar/main.py
│   └── обрабатывает: Instagram, Facebook, LinkedIn, Twitter/X, Email, Telegram, AI
├── WhatsApp sidecar — whatsapp-sidecar/ (Node.js + Evolution API / Baileys)
├── SQLite (локальная БД) — через rusqlite в Rust
└── Наш сервер — ТОЛЬКО проверка лицензии
```

---

## Технический стек

- **Tauri 2.x** (Rust) — оболочка
- **React 18** + TypeScript + **Tailwind CSS** (Catppuccin Mocha тема)
- **Zustand** — state management
- **rusqlite** (bundled) — SQLite в Rust
- **Python 3.11** sidecar — все платформы кроме WhatsApp
- **Язык интерфейса** — немецкий (DE)

---

## Текущий статус разработки (v0.2.0-beta)

### ✅ ГОТОВО — React UI (src/)

| Файл | Статус | Описание |
|------|--------|----------|
| `src/main.tsx` | ✅ | Router, Toaster |
| `src/index.css` | ✅ | Catppuccin Mocha CSS vars, базовые стили |
| `src/components/Layout.tsx` | ✅ | Sidebar + Outlet + connected accounts + Quit button |
| `src/pages/CrosspostPage.tsx` | ✅ | Переключатель Mirror / AI / Pipeline |
| `src/pages/InboxPage.tsx` | ✅ | Unified Inbox с фильтрами и AI reply |
| `src/pages/AccountsPage.tsx` | ✅ | Подключение аккаунтов всех платформ + улучшенный UX |
| `src/pages/SettingsPage.tsx` | ✅ | AI настройки, задержки, sync interval, start-minimised |
| `src/pages/LicensePage.tsx` | ✅ | Активация лицензии |
| `src/components/Crosspost/MirrorPost.tsx` | ✅ | Кросс-постинг с выбором аккаунтов |
| `src/components/Crosspost/AICreatePost.tsx` | ✅ | AI генерация + публикация |
| `src/components/Crosspost/PipelinePost.tsx` | ✅ | Pipeline posting — пошаговая публикация по платформам |
| `src/store/accounts.ts` | ✅ | Zustand store с Tauri invoke |

### ✅ ГОТОВО — Python Sidecar (python-sidecar/)

| Файл | Статус | Описание |
|------|--------|----------|
| `python-sidecar/main.py` | ✅ | Instagram, Facebook, LinkedIn, Twitter/X, Telegram (OTP), Email, AI |
| `python-sidecar/requirements.txt` | ✅ | instagrapi, tweepy, linkedin-api, telethon, anthropic, openai, google-generativeai |

Sidecar работает через **stdin/stdout JSON lines**. Каждый вызов из Rust — отдельный процесс.

### ✅ ГОТОВО — Rust Backend (src-tauri/src/)

| Файл | Статус | Описание |
|------|--------|----------|
| `src/main.rs` | ✅ | Tauri builder, system tray, все plugins, все invoke_handler |
| `src/lib.rs` | ✅ | Library crate entry |
| `src/license.rs` | ✅ | LicenseInfo struct |
| `src/db/mod.rs` | ✅ | AppDb state, initialize() с WAL mode |
| `src/db/schema.sql` | ✅ | accounts, messages, posts, contacts, settings, license |
| `src/commands/mod.rs` | ✅ | Pub exports всех модулей |
| `src/commands/accounts.rs` | ✅ | get_accounts, add_account, remove_account, update_account_status |
| `src/commands/messages.rs` | ✅ | get_messages, mark_as_read, send_reply |
| `src/commands/posts.rs` | ✅ | get_posts, create_scheduled_post, cancel_scheduled_post, post_content |
| `src/commands/settings.rs` | ✅ | get_settings, update_settings |
| `src/commands/sidecar.rs` | ✅ | call_python(), start/stop/send_to_sidecar, generate_ai_content |
| `src/commands/license.rs` | ✅ | check_license, activate_license |
| `build.rs` | ✅ | Tauri build script |

### ✅ Конфигурация и CI/CD

| Файл | Статус | Описание |
|------|--------|----------|
| `Cargo.toml` | ✅ | rusqlite (bundled), argon2 v0.4, все Tauri plugins |
| `tauri.conf.json` | ✅ | version 0.2.0 |
| `package.json` | ✅ | |
| `.github/workflows/` | ✅ | Release pipeline, GitHub Pages, auto-update landing URL |
| `.gitignore` | ✅ | sessions/, secrets, .env |
| `CHANGELOG.md` | ✅ | Ведётся с v0.1.0 |

### ✅ Платформы

| Платформа | Библиотека | Статус |
|-----------|------------|--------|
| Instagram | instagrapi | ✅ connect (OAuth), get_messages, send_message, post_content |
| Facebook | instagrapi | ✅ connect (OAuth), той же handler |
| LinkedIn | linkedin-api | ✅ connect, get_messages, post_content |
| Twitter/X | tweepy | ✅ connect, get_messages (DM), post_content |
| Telegram | telethon | ✅ connect (OTP), get_messages, post to groups/channels |
| Email | smtplib/imaplib | ✅ connect, get_messages, send_message |
| WhatsApp | Evolution API / Baileys | ⚠️ QR flow реализован, нестабилен — требует доработки |
| AI | anthropic/openai/gemini | ✅ generate_content |

---

## Быстрый старт (локальная разработка)

```bash
cd crosspost-desktop
npm install
cd python-sidecar && pip install -r requirements.txt && cd ..
npm run tauri dev   # первая компиляция ~10-20 мин, нужно 16+ GB RAM
```

---

## Как работает Python Sidecar

Rust в `commands/sidecar.rs` вызывает `call_python(command: Value)`:
1. Запускает `python python-sidecar/main.py`
2. Пишет JSON в stdin: `{"action": "...", "platform": "...", "params": {...}}`
3. Закрывает stdin → Python читает одну строку, выполняет, пишет ответ в stdout
4. Rust читает первую строку stdout как JSON ответ

---

## Credentials — хранение

Credentials хранятся в таблице `settings` с ключом `creds_{account_id}` как JSON строка.  
Telegram-сессии (`.session` файлы) хранятся в `src-tauri/sessions/` — исключены из git.  
Планируется перевести на `tauri-plugin-stronghold` (AES-256).

---

## Что нужно реализовать (приоритизированный план)

### 🔴 ПРИОРИТЕТ 1 — Стабильность и безопасность

1. **Лицензионный сервер** (`commands/license.rs`)
   - Сейчас `activate_license` принимает любой токен
   - Реализовать HTTP запрос к `https://license.crosspost-desktop.de/verify`
   - Добавить offline grace period (хранить timestamp последней валидации)

2. **Credentials в Stronghold**
   - Перевести `creds_{account_id}` из SQLite в `tauri-plugin-stronghold` (AES-256)
   - Особенно важно для Twitter API keys и Telegram session

3. **WhatsApp стабилизация**
   - Evolution API / Baileys работает нестабильно
   - Рассмотреть официальный WhatsApp Business API как альтернативу

### 🟡 ПРИОРИТЕТ 2 — Функциональные доработки

4. **Планировщик постов**
   - В БД таблица `posts` с `scheduled_at` готова
   - Нужен фоновый поток в Rust (`tokio::spawn`) для проверки каждую минуту
   - UI для выбора даты/времени публикации

5. **Медиа загрузка**
   - В MirrorPost.tsx и PipelinePost.tsx кнопка "Bild/Video hinzufügen" — TODO
   - Использовать `tauri-plugin-dialog` для выбора файла
   - Передавать путь/base64 в Python sidecar

6. **Фоновый sync сообщений**
   - Каждые N минут (из настроек) вызывать `get_messages` для каждого аккаунта
   - Сохранять в БД, показывать badge на иконке трея

7. **Instagram сессии**
   - Instagrapi: добавить кэш сессий в JSON файл, не создавать Client на каждый вызов

### 🟢 ПРИОРИТЕТ 3 — Полировка и монетизация

8. **Stripe / LemonSqueezy интеграция**
   - Форма оплаты на лэндинге → выдача лицензионного ключа
   - Webhook для деактивации при отмене подписки

9. **Onboarding flow**
   - Welcome screen при первом запуске
   - Пошаговый мастер подключения первого аккаунта

10. **Сборка и дистрибуция**
    - `npm run tauri build` → Windows installer (.msi / .exe)
    - Code signing (EV сертификат для Defender SmartScreen)
    - Mac build через GitHub Actions (self-hosted runner или cross-compile)

---

## Монетизация

```
Solo    €29/мес — 1 аккаунт каждой платформы
Pro     €79/мес — 3 аккаунта + AI генерация + Pipeline posting
Agency  €199/мес — 10 аккаунтов + white label
```

Токен-план определяется по префиксу: `AGENCY-*`, `PRO-*`, иначе `solo`.

---

## Важные ссылки

- Evolution API docs: https://doc.evolution-api.com
- Instagrapi docs: https://instagrapi.readthedocs.io
- Tauri v2 docs: https://tauri.app/docs
- linkedin-api: https://github.com/tomquirk/linkedin-api
- Tweepy docs: https://docs.tweepy.org
