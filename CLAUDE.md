# CrossPost Desktop — Claude Code Context

## Что это за проект

Десктопное приложение (Tauri 2 + React 18 + Python 3.11) для немецкого SMB-рынка.
Unified Inbox + AI Crossposting. Все данные хранятся локально (DSGVO-конформно).

**Автор:** Andrii Pylypchuk, Frankfurt am Main  
**GitHub:** https://github.com/pilipandr770/Desktop-Poster-

---

## Архитектура

```
Tauri App (Rust shell)
├── React UI (фронтенд) — src/
├── Python sidecar — python-sidecar/main.py
│   └── обрабатывает: Instagram, Facebook, LinkedIn, Twitter/X, Email, Telegram, AI
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

## Текущий статус разработки

### ✅ ГОТОВО — React UI (src/)

| Файл | Статус | Описание |
|------|--------|----------|
| `src/main.tsx` | ✅ | Router, Toaster |
| `src/index.css` | ✅ | Catppuccin Mocha CSS vars, базовые стили |
| `src/components/Layout.tsx` | ✅ | Sidebar + Outlet + connected accounts |
| `src/pages/CrosspostPage.tsx` | ✅ | Переключатель Mirror/AI |
| `src/pages/InboxPage.tsx` | ✅ | Unified Inbox с фильтрами и AI reply |
| `src/pages/AccountsPage.tsx` | ✅ | Подключение аккаунтов всех платформ |
| `src/pages/SettingsPage.tsx` | ✅ | AI настройки, задержки, автоответы |
| `src/pages/LicensePage.tsx` | ✅ | Активация лицензии |
| `src/components/Crosspost/MirrorPost.tsx` | ✅ | Кросс-постинг с выбором аккаунтов |
| `src/components/Crosspost/AICreatePost.tsx` | ✅ | AI генерация + публикация |
| `src/store/accounts.ts` | ✅ | Zustand store с Tauri invoke |

### ✅ ГОТОВО — Python Sidecar (python-sidecar/)

| Файл | Статус | Описание |
|------|--------|----------|
| `python-sidecar/main.py` | ✅ | Полный sidecar: Instagram, LinkedIn, Twitter, Telegram, Email, AI |
| `python-sidecar/requirements.txt` | ✅ | instagrapi, tweepy, linkedin-api, telethon, anthropic, openai, google-generativeai |

Sidecar работает через **stdin/stdout JSON lines**. Каждый вызов из Rust — отдельный процесс.

### ✅ ГОТОВО — Rust Backend (src-tauri/src/)

| Файл | Статус | Описание |
|------|--------|----------|
| `src/main.rs` | ✅ | Tauri builder, все plugins, все invoke_handler |
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

### ✅ Конфигурация

| Файл | Статус |
|------|--------|
| `Cargo.toml` | ✅ rusqlite (bundled), argon2 v0.4, все Tauri plugins |
| `tauri.conf.json` | ✅ |
| `package.json` | ✅ |
| `vite.config.ts` | ✅ |
| `tailwind.config.js` | ✅ |
| `tsconfig.json` | ✅ |
| `.gitignore` | ✅ |

---

## Что нужно реализовать (следующие шаги)

### 🔴 ПРИОРИТЕТ 1 — Компиляция

**Проблема:** Tauri тянет `windows` crate (огромный, ~3-4 GB RAM при компиляции).  
**Решение:** Нужно 16+ GB RAM. На машине с 32 GB всё скомпилируется.

```bash
# Первая компиляция (10-20 минут):
cd crosspost-desktop
npm install
cargo install tauri-cli  # если не установлен
npm run tauri dev
```

### 🔴 ПРИОРИТЕТ 2 — Python зависимости

```bash
cd python-sidecar
pip install -r requirements.txt
```

### 🟡 ПРИОРИТЕТ 3 — Функциональные доработки

1. **Python sidecar — сессии Instagram:**
   - Instagrapi требует сохранения сессии между вызовами
   - Сейчас каждый вызов создаёт новый Client — добавить кэш сессий в JSON файл

2. **Планировщик постов:**
   - В БД таблица `scheduled_posts` и `posts` готова
   - Нужен фоновый поток в Rust (tokio::spawn) для проверки scheduled_at каждую минуту

3. **WhatsApp через Evolution API:**
   - Отдельный Node.js sidecar (Evolution API локально)
   - Документация: https://doc.evolution-api.com

4. **Лицензионный сервер:**
   - Сейчас `activate_license` принимает любой токен
   - TODO: HTTP запрос к `https://license.crosspost-desktop.de/verify`
   - В `commands/license.rs` уже есть комментарий TODO

5. **Медиа загрузка (Tauri file dialog):**
   - В MirrorPost.tsx кнопка "Bild/Video hinzufügen" помечена как TODO
   - Использовать `tauri-plugin-dialog` для выбора файла

6. **Sync сообщений (фоновый):**
   - Каждые N минут вызывать Python sidecar `get_messages` для каждого аккаунта
   - Сохранять новые сообщения в БД

### 🟢 ПРИОРИТЕТ 4 — Полировка

- Tauri tray icon (сворачивание в трей)
- Notifications при новых сообщениях (tauri-plugin-notification)
- Сборка Windows installer (`npm run tauri build`)

---

## Как работает Python Sidecar

Rust в `commands/sidecar.rs` вызывает `call_python(command: Value)`:
1. Запускает `python python-sidecar/main.py`
2. Пишет JSON в stdin: `{"action": "connect", "platform": "instagram", "params": {...}}`
3. Закрывает stdin → Python читает одну строку, выполняет, пишет ответ в stdout
4. Rust читает первую строку stdout как JSON ответ

Формат команды:
```json
{
  "action": "connect|get_messages|send_message|post_content|generate_content",
  "platform": "instagram|facebook|linkedin|twitter|telegram|email|ai",
  "params": { ... }
}
```

---

## Credentials — хранение

Credentials хранятся в таблице `settings` с ключом `creds_{account_id}` как JSON строка.
Планируется перевести на `tauri-plugin-stronghold` (AES-256).

---

## Платформы

| Платформа | Библиотека | Статус sidecar |
|-----------|------------|----------------|
| Instagram | instagrapi | ✅ connect, get_messages, send_message, post_content |
| Facebook | instagrapi | ✅ (тот же handler) |
| LinkedIn | linkedin-api | ✅ connect, get_messages, post_content |
| Twitter/X | tweepy | ✅ connect, get_messages (DM), post_content |
| Telegram | telethon | ✅ connect, get_messages, post_content |
| Email | smtplib/imaplib | ✅ connect, get_messages, send_message |
| WhatsApp | Evolution API | ❌ не реализовано (отдельный Node.js sidecar) |
| AI | anthropic/openai/gemini | ✅ generate_content |

---

## Монетизация

```
Solo    €29/мес — 1 аккаунт каждой платформы
Pro     €79/мес — 3 аккаунта + AI генерация
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
