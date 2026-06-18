use crate::db::AppDb;
use serde_json::Value;
use std::io::{BufWriter, Write};
use std::process::{Command, Stdio};
use tauri::State;

/// Spawn a fresh Python process, send one JSON command, read one JSON response.
/// Each call is stateless — Python reads one line, responds, then exits (stdin EOF).
pub fn call_python(command: Value) -> Result<Value, String> {
    let python_bin = if cfg!(windows) { "python" } else { "python3" };

    // Locate sidecar: dev (project root) vs production (next to exe)
    let sidecar_path = {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()));

        let candidates = [
            // dev: running from crosspost-desktop/
            std::path::PathBuf::from("python-sidecar/main.py"),
            // dev: running from src-tauri/
            std::path::PathBuf::from("../python-sidecar/main.py"),
            // production: bundled next to exe
            exe_dir
                .as_ref()
                .map(|d| d.join("python-sidecar/main.py"))
                .unwrap_or_default(),
        ];

        candidates
            .into_iter()
            .find(|p| p.exists())
            .ok_or_else(|| "Python-Sidecar nicht gefunden".to_string())?
    };

    let mut child = Command::new(python_bin)
        .arg(&sidecar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Python konnte nicht gestartet werden: {}", e))?;

    // Write command and close stdin → Python reads until EOF, processes, exits
    {
        let stdin = child.stdin.take().ok_or("Kein stdin")?;
        let mut w = BufWriter::new(stdin);
        writeln!(w, "{}", command).map_err(|e| e.to_string())?;
        // BufWriter + stdin drop here, which closes the pipe
    }

    let output = child
        .wait_with_output()
        .map_err(|e| e.to_string())?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout_str.lines().next().unwrap_or("{}");

    serde_json::from_str(first_line)
        .map_err(|e| format!("Ungültige JSON-Antwort vom Sidecar: {}", e))
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn start_python_sidecar() -> Result<(), String> {
    // Sidecar is spawned per-command; no persistent process needed.
    Ok(())
}

#[tauri::command]
pub fn stop_python_sidecar() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn send_to_sidecar(command: Value) -> Result<Value, String> {
    call_python(command)
}

#[tauri::command]
pub async fn generate_ai_content(
    db: State<'_, AppDb>,
    platform: String,
    prompt: String,
) -> Result<Value, String> {
    // Read AI config from DB
    let (provider, use_own, own_key) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        let provider: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'ai_provider'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "anthropic".to_string());

        let use_own: bool = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'ai_use_own'",
                [],
                |row| row.get::<_, String>(0),
            )
            .map(|v| v == "1")
            .unwrap_or(false);

        let own_key: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'ai_own_key'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_default();

        (provider, use_own, own_key)
    };

    if use_own && own_key.is_empty() {
        return Err(
            "Kein API-Schlüssel konfiguriert. Bitte in Einstellungen angeben.".to_string(),
        );
    }

    let api_key = if use_own {
        own_key
    } else {
        // Use our proxy (requires valid license — enforced server-side)
        "crosspost-proxy".to_string()
    };

    let cmd = serde_json::json!({
        "action": "generate_content",
        "platform": "ai",
        "params": {
            "provider": provider,
            "api_key": api_key,
            "prompt": prompt,
            "platform": platform
        }
    });

    call_python(cmd)
}
