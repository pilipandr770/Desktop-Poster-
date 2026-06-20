use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Post {
    pub id: String,
    pub content: String,
    pub platforms: Vec<String>,
    pub status: String,
    pub scheduled_at: Option<String>,
    pub published_at: Option<String>,
    pub ai_generated: bool,
    pub created_at: String,
}

#[tauri::command]
pub fn get_posts(db: State<'_, AppDb>) -> Result<Vec<Post>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, content, platforms, status, scheduled_at, published_at, ai_generated, created_at
             FROM posts ORDER BY created_at DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let posts = stmt
        .query_map([], |row| {
            let platforms_json: String = row.get(2)?;
            let platforms: Vec<String> =
                serde_json::from_str(&platforms_json).unwrap_or_default();
            Ok(Post {
                id: row.get(0)?,
                content: row.get(1)?,
                platforms,
                status: row.get(3)?,
                scheduled_at: row.get(4)?,
                published_at: row.get(5)?,
                ai_generated: row.get::<_, i32>(6)? != 0,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(posts)
}

#[tauri::command]
pub fn create_scheduled_post(
    db: State<'_, AppDb>,
    content: String,
    platforms: Vec<String>,
    account_ids: Vec<String>,
    scheduled_at: String,
) -> Result<Post, String> {
    let id = Uuid::new_v4().to_string();
    let platforms_json = serde_json::to_string(&platforms).map_err(|e| e.to_string())?;
    let account_ids_json = serde_json::to_string(&account_ids).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO posts (id, content, platforms, account_ids, status, scheduled_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'scheduled', ?5, ?6, ?6)",
        params![id, content, platforms_json, account_ids_json, scheduled_at, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Post {
        id,
        content,
        platforms,
        status: "scheduled".to_string(),
        scheduled_at: Some(scheduled_at),
        published_at: None,
        ai_generated: false,
        created_at: now,
    })
}

#[tauri::command]
pub fn cancel_scheduled_post(db: State<'_, AppDb>, post_id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE posts SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?1",
        params![post_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn post_content(
    db: State<'_, AppDb>,
    account_id: String,
    content: String,
    media_path: Option<String>,
) -> Result<(), String> {
    // Fetch account info + credentials
    let (platform, credentials) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        let platform: String = conn
            .query_row(
                "SELECT platform FROM accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Konto nicht gefunden: {}", e))?;

        let creds_json: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![format!("creds_{}", account_id)],
                |row| row.get(0),
            )
            .map_err(|e| format!("Zugangsdaten nicht gefunden: {}", e))?;

        let creds: HashMap<String, String> =
            serde_json::from_str(&creds_json).map_err(|e| e.to_string())?;

        (platform, creds)
    };

    let mut sidecar_params = serde_json::json!({
        "session": credentials,
        "content": content
    });
    if let Some(path) = &media_path {
        sidecar_params["media_path"] = serde_json::Value::String(path.clone());
    }

    let cmd = serde_json::json!({
        "action": "post_content",
        "platform": platform,
        "params": sidecar_params
    });

    let result = crate::commands::sidecar::call_python(cmd)?;

    if !result["success"].as_bool().unwrap_or(false) {
        return Err(
            result["error"]
                .as_str()
                .unwrap_or("Veröffentlichung fehlgeschlagen")
                .to_string(),
        );
    }

    // Record published post
    let post_id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO posts (id, content, platforms, account_ids, status, published_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'published', datetime('now'), datetime('now'), datetime('now'))",
        params![
            post_id,
            content,
            serde_json::json!([platform]).to_string(),
            serde_json::json!([account_id]).to_string()
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn fetch_account_posts(
    db: State<'_, AppDb>,
    account_id: String,
    limit: Option<u32>,
) -> Result<serde_json::Value, String> {
    let (platform, credentials) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let platform: String = conn
            .query_row(
                "SELECT platform FROM accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Konto nicht gefunden: {}", e))?;
        let creds_json: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![format!("creds_{}", account_id)],
                |row| row.get(0),
            )
            .map_err(|e| format!("Zugangsdaten nicht gefunden: {}", e))?;
        let creds: std::collections::HashMap<String, String> =
            serde_json::from_str(&creds_json).map_err(|e| e.to_string())?;
        (platform, creds)
    };

    let cmd = serde_json::json!({
        "action": "get_posts",
        "platform": platform,
        "params": { "credentials": credentials, "limit": limit.unwrap_or(10) }
    });

    crate::commands::sidecar::call_python(cmd)
}
