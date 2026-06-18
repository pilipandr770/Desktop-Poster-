-- CrossPost Desktop — SQLite Schema
-- Все данные хранятся локально на компьютере пользователя

-- Подключённые аккаунты (credentials зашифрованы через Stronghold)
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL, -- 'instagram', 'whatsapp', 'facebook', 'linkedin', 'twitter', 'telegram', 'email'
    display_name TEXT NOT NULL,
    username TEXT,
    avatar_url TEXT,
    stronghold_key TEXT NOT NULL, -- ключ для получения credentials из Stronghold
    status TEXT DEFAULT 'disconnected', -- 'connected', 'disconnected', 'error'
    last_sync TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Все входящие/исходящие сообщения
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    platform TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    sender_name TEXT,
    sender_id TEXT,
    sender_avatar TEXT,
    content TEXT,
    media_url TEXT,
    media_type TEXT, -- 'image', 'video', 'audio', 'document'
    direction TEXT NOT NULL, -- 'incoming', 'outgoing'
    is_read INTEGER DEFAULT 0,
    ai_suggested_reply TEXT,
    created_at TEXT NOT NULL,
    synced_at TEXT DEFAULT (datetime('now'))
);

-- Контакты (CRM-лайт)
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    platform_ids TEXT, -- JSON: {"instagram": "user123", "whatsapp": "+49..."}
    tags TEXT, -- JSON array
    notes TEXT,
    status TEXT DEFAULT 'lead', -- 'lead', 'customer', 'vip'
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- История публикаций
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT NOT NULL,
    media_urls TEXT, -- JSON array
    platforms TEXT NOT NULL, -- JSON array: ["instagram", "facebook", ...]
    account_ids TEXT NOT NULL, -- JSON array
    status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'published', 'failed'
    scheduled_at TEXT,
    published_at TEXT,
    ai_generated INTEGER DEFAULT 0,
    ai_prompt TEXT,
    platform_results TEXT, -- JSON: статус публикации на каждой платформе
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- AI промпты и шаблоны
CREATE TABLE IF NOT EXISTS ai_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    platforms TEXT, -- JSON array, null = все платформы
    created_at TEXT DEFAULT (datetime('now'))
);

-- Настройки приложения
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Лицензия
CREATE TABLE IF NOT EXISTS license (
    id INTEGER PRIMARY KEY DEFAULT 1,
    token TEXT,
    plan TEXT, -- 'solo', 'pro', 'agency'
    valid_until TEXT,
    last_check TEXT,
    CHECK (id = 1) -- только одна запись
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_id);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at);

-- Дефолтные настройки
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('language', 'de'),
    ('ai_provider', 'anthropic'),
    ('ai_own_key', ''),
    ('ai_use_own', '0'),
    ('human_delay_min', '2.5'),
    ('human_delay_max', '8.0'),
    ('auto_reply_enabled', '0'),
    ('notifications_enabled', '1'),
    ('theme', 'dark'),
    ('start_minimized', '0');
