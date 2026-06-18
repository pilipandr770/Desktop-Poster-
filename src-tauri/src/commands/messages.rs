use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub account_id: String,
    pub platform: String,
    pub conversation_id: String,
    pub sender_name: Option<String>,
    pub sender_id: Option<String>,
    pub content: Option<String>,
    pub direction: String,
    pub is_read: bool,
    pub ai_suggested_reply: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn get_messages(db: State<'_, AppDb>) -> Result<Vec<Message>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, platform, conversation_id, sender_name, sender_id,
             content, direction, is_read, ai_suggested_reply, created_at
             FROM messages ORDER BY created_at DESC LIMIT 200",
        )
        .map_err(|e| e.to_string())?;

    let messages = stmt
        .query_map([], |row| {
            Ok(Message {
                id: row.get(0)?,
                account_id: row.get(1)?,
                platform: row.get(2)?,
                conversation_id: row.get(3)?,
                sender_name: row.get(4)?,
                sender_id: row.get(5)?,
                content: row.get(6)?,
                direction: row.get(7)?,
                is_read: row.get::<_, i32>(8)? != 0,
                ai_suggested_reply: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(messages)
}

#[tauri::command]
pub fn mark_as_read(db: State<'_, AppDb>, message_id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE messages SET is_read = 1 WHERE id = ?1",
        params![message_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn send_reply(
    db: State<'_, AppDb>,
    message_id: String,
    content: String,
) -> Result<(), String> {
    // Load the original message to find account/platform/sender
    let (account_id, platform, sender_id, conversation_id) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT account_id, platform, sender_id, conversation_id FROM messages WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        stmt.query_row(params![message_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| format!("Nachricht nicht gefunden: {}", e))?
    };

    // Load credentials for this account
    let credentials: HashMap<String, String> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let creds_json: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![format!("creds_{}", account_id)],
                |row| row.get(0),
            )
            .map_err(|e| format!("Zugangsdaten nicht gefunden: {}", e))?;
        serde_json::from_str(&creds_json).map_err(|e| e.to_string())?
    };

    // Dispatch to Python sidecar
    let cmd = serde_json::json!({
        "action": "send_message",
        "platform": platform,
        "params": {
            "session": credentials,
            "user_id": sender_id,
            "text": content
        }
    });

    let result = crate::commands::sidecar::call_python(cmd)?;

    if !result["success"].as_bool().unwrap_or(false) {
        return Err(
            result["error"]
                .as_str()
                .unwrap_or("Senden fehlgeschlagen")
                .to_string(),
        );
    }

    // Mark original as read + record outgoing reply
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE messages SET is_read = 1 WHERE id = ?1",
        params![message_id],
    )
    .map_err(|e| e.to_string())?;

    let reply_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO messages (id, account_id, platform, conversation_id, content, direction, is_read, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'outgoing', 1, datetime('now'))",
        params![reply_id, account_id, platform, conversation_id, content],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
