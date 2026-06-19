use crate::db::AppDb;
use serde_json::Value;
use std::io::{BufWriter, Write};
use std::process::{Command, Stdio};
use tauri::State;

/// Spawn a fresh Python process, send one JSON command, read one JSON response.
/// Each call is stateless — Python reads one line, responds, then exits (stdin EOF).
pub fn call_python(command: Value) -> Result<Value, String> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    // In production: sidecar.exe (compiled by PyInstaller) lives next to the app exe
    let bundled_exe = exe_dir.as_ref().and_then(|d| {
        let p = if cfg!(windows) {
            d.join("sidecar.exe")
        } else {
            d.join("sidecar")
        };
        if p.exists() { Some(p) } else { None }
    });

    let mut child = if let Some(ref exe) = bundled_exe {
        // Production path: compiled sidecar binary, no Python needed
        Command::new(exe)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Sidecar konnte nicht gestartet werden: {}", e))?
    } else {
        // Dev path: run main.py via Python interpreter
        let script_candidates = [
            std::path::PathBuf::from("python-sidecar/main.py"),
            std::path::PathBuf::from("../python-sidecar/main.py"),
            exe_dir
                .as_ref()
                .map(|d| d.join("python-sidecar/main.py"))
                .unwrap_or_default(),
        ];
        let sidecar_path = script_candidates
            .into_iter()
            .find(|p| p.exists())
            .ok_or_else(|| "Python-Sidecar nicht gefunden".to_string())?;

        let sidecar_dir = sidecar_path.parent().unwrap_or(std::path::Path::new("."));
        let venv_python_candidates = [
            sidecar_dir.join(".venv/Scripts/python.exe"),
            sidecar_dir.join(".venv/bin/python"),
        ];
        let python_bin: std::path::PathBuf = venv_python_candidates
            .into_iter()
            .find(|p| p.exists())
            .unwrap_or_else(|| {
                if cfg!(windows) { "python".into() } else { "python3".into() }
            });

        Command::new(&python_bin)
            .arg(&sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Python konnte nicht gestartet werden: {}", e))?
    };

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
