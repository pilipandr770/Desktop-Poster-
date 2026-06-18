# CrossPost Desktop

Десктопное приложение для кросспостинга в социальных сетях.
Все данные локально. Meta/TikTok видят домашний IP. DSGVO-konform.

## Платформы

- ✅ Instagram (Instagrapi)
- ✅ Facebook (Instagrapi)
- ✅ WhatsApp (Evolution API)
- ✅ LinkedIn (linkedin-api)
- ✅ Twitter/X (Tweepy)
- ✅ Telegram (Telethon)
- ✅ Email (SMTP/IMAP)

## Быстрый старт для разработки

```bash
# 1. Установить зависимости
npm install

# 2. Python sidecar
cd python-sidecar
pip install -r requirements.txt
cd ..

# 3. Запустить в режиме разработки
npm run tauri dev
```

## Требования

- Node.js 18+
- Rust (stable)
- Python 3.11+
- Tauri CLI: `npm install -g @tauri-apps/cli`

## Сборка

```bash
# Windows
npm run tauri build -- --target x86_64-pc-windows-msvc

# macOS
npm run tauri build -- --target x86_64-apple-darwin
```

## Архитектура

```
src/                    # React UI
src-tauri/              # Rust/Tauri backend
python-sidecar/         # Python (Instagram, LinkedIn, etc.)
docs/                   # Документация
```

## Файл CLAUDE.md

Содержит полный контекст проекта для Claude Code.
Открой его первым делом в Claude Code.
