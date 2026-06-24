use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: String,
    pub platform: String,
    pub display_name: String,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub status: String,
    pub last_sync: Option<String>,
}

#[tauri::command]
pub fn get_accounts(db: State<'_, AppDb>) -> Result<Vec<Account>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, platform, display_name, username, avatar_url, status, last_sync
             FROM accounts ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;

    let accounts = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                platform: row.get(1)?,
                display_name: row.get(2)?,
                username: row.get(3)?,
                avatar_url: row.get(4)?,
                status: row.get(5)?,
                last_sync: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(accounts)
}

#[tauri::command]
pub async fn add_account(
    db: State<'_, AppDb>,
    platform: String,
    credentials: HashMap<String, String>,
) -> Result<Account, String> {
    // For email: pre-resolve IMAP/SMTP hostnames in Rust (Tauri has DNS access)
    // and inject resolved IPs so Python subprocess doesn't need DNS.
    let mut enriched = credentials.clone();
    if platform == "email" {
        if let Some(imap_host) = credentials.get("imap_host") {
            if let Ok(mut addrs) = tokio::net::lookup_host(format!("{}:993", imap_host)).await {
                if let Some(addr) = addrs.next() {
                    enriched.insert("imap_host_ip".to_string(), addr.ip().to_string());
                }
            }
        }
        if let Some(smtp_host) = credentials.get("smtp_host") {
            if let Ok(mut addrs) = tokio::net::lookup_host(format!("{}:465", smtp_host)).await {
                if let Some(addr) = addrs.next() {
                    enriched.insert("smtp_host_ip".to_string(), addr.ip().to_string());
                }
            }
        }
    }

    // Call Python sidecar to verify the connection
    let cmd = serde_json::json!({
        "action": "connect",
        "platform": platform,
        "params": { "credentials": enriched }
    });

    let result = crate::commands::sidecar::call_python(cmd)?;

    if !result["success"].as_bool().unwrap_or(false) {
        return Err(
            result["error"]
                .as_str()
                .unwrap_or("Verbindung fehlgeschlagen")
                .to_string(),
        );
    }

    let display_name = result["profile"]["name"]
        .as_str()
        .or_else(|| credentials.get("username").map(|s| s.as_str()))
        .or_else(|| credentials.get("email").map(|s| s.as_str()))
        .or_else(|| credentials.get("phone").map(|s| s.as_str()))
        .unwrap_or(&platform)
        .to_string();
    let username = result["profile"]["username"]
        .as_str()
        .map(|s| s.to_string());

    let now = chrono::Utc::now().to_rfc3339();
    let creds_json = serde_json::to_string(&credentials).map_err(|e| e.to_string())?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // ── License plan limit check ──────────────────────────────────────────────
    let plan: String = conn
        .query_row(
            "SELECT COALESCE(plan, 'solo') FROM license WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "solo".to_string());

    let max_per_platform: u32 = match plan.to_lowercase().as_str() {
        "agency" => 10,
        "pro"    => 3,
        _        => 1, // solo / no license
    };

    let current_count: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE platform = ?1",
            params![platform],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // For Solo: update the single existing account instead of blocking
    let existing_id: Option<String> = if max_per_platform == 1 {
        conn.query_row(
            "SELECT id FROM accounts WHERE platform = ?1 LIMIT 1",
            params![platform],
            |row| row.get(0),
        )
        .ok()
    } else {
        None
    };

    if existing_id.is_none() && current_count >= max_per_platform {
        let plan_label = plan.to_uppercase();
        return Err(format!(
            "Kontolimit erreicht. Plan {plan_label} erlaubt maximal {max_per_platform} \
             Konto/Konten pro Plattform. Bitte upgraden Sie Ihren Plan unter Lizenz."
        ));
    }
    // ─────────────────────────────────────────────────────────────────────────

    let id = if let Some(existing_id) = existing_id {
        // Solo plan: update the one existing account
        conn.execute(
            "UPDATE accounts SET display_name = ?1, username = ?2, status = 'connected', last_sync = ?3, updated_at = ?3 WHERE id = ?4",
            params![display_name, username, now, existing_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![format!("creds_{}", existing_id), creds_json],
        )
        .map_err(|e| e.to_string())?;
        existing_id
    } else {
        // Pro / Agency: create a new account slot
        let new_id = Uuid::new_v4().to_string();
        let stronghold_key = format!("account_{}", new_id);
        conn.execute(
            "INSERT INTO accounts (id, platform, display_name, username, stronghold_key, status, last_sync)
             VALUES (?1, ?2, ?3, ?4, ?5, 'connected', ?6)",
            params![new_id, platform, display_name, username, stronghold_key, now],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![format!("creds_{}", new_id), creds_json],
        )
        .map_err(|e| e.to_string())?;
        new_id
    };

    Ok(Account {
        id,
        platform,
        display_name,
        username,
        avatar_url: None,
        status: "connected".to_string(),
        last_sync: Some(now),
    })
}

#[tauri::command]
pub fn remove_account(db: State<'_, AppDb>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM settings WHERE key = ?1",
        params![format!("creds_{}", id)],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_account_credentials(
    db: State<'_, AppDb>,
    id: String,
    credentials: HashMap<String, String>,
) -> Result<(), String> {
    let creds_json = serde_json::to_string(&credentials).map_err(|e| e.to_string())?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![format!("creds_{}", id), creds_json],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE accounts SET status = 'connected', last_sync = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_account_status(
    db: State<'_, AppDb>,
    id: String,
    status: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE accounts SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
