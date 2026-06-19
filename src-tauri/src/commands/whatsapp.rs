use std::sync::Mutex;
use std::process::{Child, Command, Stdio};
use tauri::State;
use serde_json::Value;

/// Check whether Node.js is installed. Returns version string or None.
#[tauri::command]
pub fn check_nodejs() -> Option<String> {
    let bin = if cfg!(windows) { "node.exe" } else { "node" };
    Command::new(bin)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
}

/// Install Node.js LTS via winget (Windows) or open download page as fallback.
#[tauri::command]
pub fn install_nodejs() -> Result<String, String> {
    // Try winget (available on Windows 10 2004+ and Windows 11)
    let winget = Command::new("winget")
        .args([
            "install",
            "OpenJS.NodeJS.LTS",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--silent",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    if winget.is_ok() {
        return Ok("winget".to_string());
    }

    // Fallback: open browser
    let open_result = if cfg!(windows) {
        Command::new("cmd").args(["/c", "start", "https://nodejs.org/en/download/"]).spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg("https://nodejs.org/en/download/").spawn()
    } else {
        Command::new("xdg-open").arg("https://nodejs.org/en/download/").spawn()
    };

    open_result
        .map(|_| "browser".to_string())
        .map_err(|e| e.to_string())
}

pub struct WhatsAppProcess(pub Mutex<Option<Child>>);

fn whatsapp_sidecar_dir() -> std::path::PathBuf {
    let candidates = [
        std::path::PathBuf::from("whatsapp-sidecar"),
        std::path::PathBuf::from("../whatsapp-sidecar"),
    ];
    candidates.into_iter().find(|p| p.join("server.js").exists())
        .unwrap_or_else(|| std::path::PathBuf::from("whatsapp-sidecar"))
}

fn find_node() -> &'static str {
    if cfg!(windows) { "node" } else { "node" }
}

#[tauri::command]
pub fn start_whatsapp_sidecar(state: State<'_, WhatsAppProcess>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Already running?
    if let Some(ref mut child) = *guard {
        if child.try_wait().map(|s| s.is_none()).unwrap_or(false) {
            return Ok(());
        }
    }

    let dir = whatsapp_sidecar_dir();
    let child = Command::new(find_node())
        .arg("server.js")
        .current_dir(&dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Node.js konnte nicht gestartet werden: {}", e))?;

    *guard = Some(child);
    Ok(())
}

#[tauri::command]
pub fn stop_whatsapp_sidecar(state: State<'_, WhatsAppProcess>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        child.kill().ok();
    }
    Ok(())
}

/// Proxy any HTTP call to the local WhatsApp sidecar
#[tauri::command]
pub async fn whatsapp_call(method: String, path: String, body: Option<Value>) -> Result<Value, String> {
    let url = format!("http://127.0.0.1:3001{}", path);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let req = match method.to_uppercase().as_str() {
        "POST" => {
            let mut r = client.post(&url);
            if let Some(b) = body {
                r = r.json(&b);
            }
            r
        }
        _ => client.get(&url),
    };

    let resp = req.send().await.map_err(|e| {
        if e.is_connect() {
            "WhatsApp-Sidecar nicht erreichbar. Bitte Node.js installieren.".to_string()
        } else {
            e.to_string()
        }
    })?;

    resp.json::<Value>().await.map_err(|e| e.to_string())
}
