use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    pub ai_provider: String,
    pub ai_use_own: bool,
    pub ai_own_key: String,
    pub human_delay_min: String,
    pub human_delay_max: String,
    pub auto_reply_enabled: bool,
    pub notifications_enabled: bool,
    pub start_minimized: bool,
}

fn read(conn: &rusqlite::Connection, key: &str, default: &str) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| default.to_string())
}

#[tauri::command]
pub fn get_settings(db: State<'_, AppDb>) -> Result<Settings, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    Ok(Settings {
        ai_provider: read(&conn, "ai_provider", "anthropic"),
        ai_use_own: read(&conn, "ai_use_own", "0") == "1",
        ai_own_key: read(&conn, "ai_own_key", ""),
        human_delay_min: read(&conn, "human_delay_min", "2.5"),
        human_delay_max: read(&conn, "human_delay_max", "8.0"),
        auto_reply_enabled: read(&conn, "auto_reply_enabled", "0") == "1",
        notifications_enabled: read(&conn, "notifications_enabled", "1") == "1",
        start_minimized: read(&conn, "start_minimized", "0") == "1",
    })
}

#[tauri::command]
pub fn update_settings(db: State<'_, AppDb>, settings: Settings) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let pairs: Vec<(&str, String)> = vec![
        ("ai_provider", settings.ai_provider),
        (
            "ai_use_own",
            if settings.ai_use_own { "1" } else { "0" }.to_string(),
        ),
        ("ai_own_key", settings.ai_own_key),
        ("human_delay_min", settings.human_delay_min),
        ("human_delay_max", settings.human_delay_max),
        (
            "auto_reply_enabled",
            if settings.auto_reply_enabled { "1" } else { "0" }.to_string(),
        ),
        (
            "notifications_enabled",
            if settings.notifications_enabled { "1" } else { "0" }.to_string(),
        ),
        (
            "start_minimized",
            if settings.start_minimized { "1" } else { "0" }.to_string(),
        ),
    ];

    for (key, value) in pairs {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
