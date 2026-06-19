use crate::db::AppDb;
use rusqlite::params;
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// Start the background scheduler. Called once from main.rs setup.
/// Waits for the DB to be ready, then ticks every 60 seconds:
///   • executes due scheduled posts
///   • syncs incoming messages for all connected accounts (configurable interval)
pub fn start(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Give DB initialization time to complete
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

        let mut ticker = tokio::time::interval(tokio::time::Duration::from_secs(60));

        loop {
            ticker.tick().await;

            if let Some(db) = app_handle.try_state::<AppDb>() {
                run_scheduled_posts(&db);
                maybe_sync_messages(&db, &app_handle);
            }
        }
    });
}

// ─── Scheduled posts ──────────────────────────────────────────────────────────

fn run_scheduled_posts(db: &AppDb) {
    let due = {
        let conn = match db.0.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        let mut stmt = match conn.prepare(
            "SELECT id, content, account_ids FROM posts
             WHERE status = 'scheduled' AND scheduled_at <= datetime('now')",
        ) {
            Ok(s) => s,
            Err(_) => return,
        };
        stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .ok()
        .map(|it| it.flatten().collect::<Vec<_>>())
        .unwrap_or_default()
    };

    for (post_id, content, account_ids_json) in due {
        let account_ids: Vec<String> =
            serde_json::from_str(&account_ids_json).unwrap_or_default();

        let all_ok = account_ids.iter().all(|aid| {
            publish_for_account(db, aid, &content).is_ok()
        });

        let status = if all_ok { "published" } else { "failed" };
        if let Ok(conn) = db.0.lock() {
            let _ = conn.execute(
                "UPDATE posts SET status = ?1, published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?2",
                params![status, post_id],
            );
        }
    }
}

fn publish_for_account(db: &AppDb, account_id: &str, content: &str) -> Result<(), String> {
    let (platform, creds) = fetch_creds(db, account_id)?;

    let cmd = serde_json::json!({
        "action": "post_content",
        "platform": platform,
        "params": { "session": creds, "content": content }
    });

    let res = crate::commands::sidecar::call_python(cmd)?;
    if !res["success"].as_bool().unwrap_or(false) {
        return Err(res["error"].as_str().unwrap_or("failed").to_string());
    }
    Ok(())
}

// ─── Message sync ─────────────────────────────────────────────────────────────

fn maybe_sync_messages(db: &AppDb, app: &AppHandle) {
    let interval_min: i64 = {
        let conn = match db.0.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'sync_interval'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(15)
    };

    let should_sync = {
        let conn = match db.0.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'last_message_sync'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|v| chrono::DateTime::parse_from_rfc3339(&v).ok())
        .map(|last| {
            chrono::Utc::now()
                .signed_duration_since(last.with_timezone(&chrono::Utc))
                .num_minutes()
                >= interval_min
        })
        .unwrap_or(true)
    };

    if !should_sync {
        return;
    }

    let accounts = {
        let conn = match db.0.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        let mut stmt = match conn.prepare(
            "SELECT id, platform FROM accounts WHERE status = 'connected'",
        ) {
            Ok(s) => s,
            Err(_) => return,
        };
        stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .ok()
        .map(|it| it.flatten().collect::<Vec<_>>())
        .unwrap_or_default()
    };

    let mut total_new = 0usize;
    for (account_id, platform) in accounts {
        if let Ok(n) = sync_account(db, &account_id, &platform) {
            total_new += n;
        }
    }

    if total_new > 0 {
        let body = if total_new == 1 {
            "1 neue Nachricht eingegangen".to_string()
        } else {
            format!("{} neue Nachrichten eingegangen", total_new)
        };
        let _ = app
            .notification()
            .builder()
            .title("CrossPost Desktop")
            .body(&body)
            .show();
    }

    let now = chrono::Utc::now().to_rfc3339();
    if let Ok(conn) = db.0.lock() {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_message_sync', ?1)",
            params![now],
        );
    }
}

fn sync_account(db: &AppDb, account_id: &str, platform: &str) -> Result<usize, String> {
    let (_, creds) = fetch_creds(db, account_id)?;

    let cmd = serde_json::json!({
        "action": "get_messages",
        "platform": platform,
        "params": { "session": creds, "limit": 20 }
    });

    let res = crate::commands::sidecar::call_python(cmd)?;
    if !res["success"].as_bool().unwrap_or(false) {
        return Err(res["error"].as_str().unwrap_or("sync error").to_string());
    }

    let messages = res["messages"].as_array().cloned().unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();
    let mut new_count = 0usize;

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    for msg in &messages {
        let id = msg["id"].as_str().unwrap_or("");
        if id.is_empty() {
            continue;
        }
        let inserted = conn.execute(
            "INSERT OR IGNORE INTO messages
             (id, account_id, platform, conversation_id, sender_name, sender_id, content, direction, is_read, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9)",
            params![
                id,
                account_id,
                platform,
                msg["conversation_id"].as_str().unwrap_or(""),
                msg["sender_name"].as_str().unwrap_or(""),
                msg["sender_id"].as_str().unwrap_or(""),
                msg["content"].as_str().unwrap_or(""),
                msg["direction"].as_str().unwrap_or("incoming"),
                msg["created_at"].as_str().unwrap_or(&now),
            ],
        ).unwrap_or(0);
        // Only count incoming messages that were actually new (not already in DB)
        if inserted > 0 && msg["direction"].as_str().unwrap_or("incoming") == "incoming" {
            new_count += 1;
        }
    }

    let _ = conn.execute(
        "UPDATE accounts SET last_sync = ?1 WHERE id = ?2",
        params![now, account_id],
    );

    Ok(new_count)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn fetch_creds(db: &AppDb, account_id: &str) -> Result<(String, HashMap<String, String>), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let platform: String = conn
        .query_row(
            "SELECT platform FROM accounts WHERE id = ?1",
            params![account_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Account not found: {}", e))?;

    let creds_json: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![format!("creds_{}", account_id)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Credentials not found: {}", e))?;

    let creds: HashMap<String, String> =
        serde_json::from_str(&creds_json).map_err(|e| e.to_string())?;

    Ok((platform, creds))
}
