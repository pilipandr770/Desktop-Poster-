use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub struct AppDb(pub Arc<Mutex<Connection>>);

pub async fn initialize(app_handle: &AppHandle) -> Result<(), String> {
    let db_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("crosspost.db");

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute_batch(include_str!("schema.sql"))
        .map_err(|e| e.to_string())?;

    // Enable WAL mode for better concurrent access
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;

    app_handle.manage(AppDb(Arc::new(Mutex::new(conn))));

    Ok(())
}
