use std::sync::Mutex;
use std::process::{Child, Command, Stdio};
use tauri::State;
use serde_json::Value;

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
