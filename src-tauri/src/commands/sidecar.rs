use crate::db::AppDb;
use serde_json::Value;
use std::io::{BufWriter, Write};
use std::process::{Command, Stdio};
use tauri::State;

fn decode_process_output(bytes: &[u8]) -> String {
    if let Ok(s) = String::from_utf8(bytes.to_vec()) {
        return s;
    }

    #[cfg(windows)]
    {
        // Some Windows dependencies still write cp1251/cp866 bytes into stderr.
        // Decode with common legacy code pages to avoid unreadable replacement chars.
        use encoding_rs::{IBM866, WINDOWS_1251};
        let (cp1251, _, _) = WINDOWS_1251.decode(bytes);
        let (cp866, _, _) = IBM866.decode(bytes);

        let cp1251_score = cp1251
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || c.is_whitespace() || ('\u{0400}'..='\u{04FF}').contains(c))
            .count();
        let cp866_score = cp866
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || c.is_whitespace() || ('\u{0400}'..='\u{04FF}').contains(c))
            .count();

        if cp1251_score >= cp866_score {
            return cp1251.into_owned();
        }
        return cp866.into_owned();
    }

    #[cfg(not(windows))]
    {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

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
        let mut cmd = Command::new(exe);
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUNBUFFERED", "1");
        for key in &["SYSTEMROOT", "WINDIR", "USERPROFILE", "APPDATA",
                     "LOCALAPPDATA", "TEMP", "TMP", "PATH"] {
            if let Ok(val) = std::env::var(key) { cmd.env(key, val); }
        }
        cmd.spawn()
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

        // Build command with full inherited environment
        // Windows DNS (WinSock) requires SYSTEMROOT to be set in the process env
        let mut cmd = Command::new(&python_bin);
        cmd.arg("-X")
            .arg("utf8")
            .arg(&sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1")
            .env("PYTHONUNBUFFERED", "1");

        // Explicitly forward critical Windows env vars for network / SSL
        for key in &["SYSTEMROOT", "WINDIR", "USERPROFILE", "APPDATA",
                     "LOCALAPPDATA", "TEMP", "TMP", "PATH",
                     "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE"] {
            if let Ok(val) = std::env::var(key) {
                cmd.env(key, val);
            }
        }

        cmd.spawn()
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

    let stdout_str = decode_process_output(&output.stdout);
    let stderr_str = decode_process_output(&output.stderr);

    // Find first line that looks like JSON (starts with '{' or '[')
    // Some Windows libs print garbage to stdout before our JSON
    let json_line = stdout_str
        .lines()
        .map(|l| l.trim())
        .find(|l| l.starts_with('{') || l.starts_with('['));

    match json_line {
        Some(line) => serde_json::from_str(line)
            .map_err(|e| format!("JSON-Parse-Fehler: {}", e)),
        None => {
            // No JSON found — collect meaningful stderr lines
            let err_detail: String = stderr_str
                .lines()
                .filter(|l| {
                    !l.contains(":INFO:") && !l.contains("Human delay")
                        && !l.trim().is_empty()
                })
                .collect::<Vec<_>>()
                .join(" | ");
            let msg = if err_detail.is_empty() {
                "Sidecar gab keine Antwort. Python-Interpreter prüfen.".to_string()
            } else {
                let trimmed = if err_detail.len() > 400 {
                    &err_detail[err_detail.len() - 400..]
                } else {
                    &err_detail
                };
                format!("Sidecar-Fehler: {}", trimmed)
            };
            Err(msg)
        }
    }
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
