use std::sync::Mutex;
use std::process::{Child, Command, Stdio};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use serde_json::Value;

// Portable Node.js – we extract node.exe + npm-cli.js from the zip
const NODE_ZIP_URL: &str =
    "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip";
const NODE_PREFIX: &str = "node-v20.18.0-win-x64";

/// Returns path to bundled node.exe in AppData (downloaded on demand).
fn bundled_node_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    dir.join("node").join("node.exe")
}

/// Returns path to whatsapp-sidecar directory (relative to binary).
fn whatsapp_sidecar_dir() -> PathBuf {
    let candidates = [
        PathBuf::from("whatsapp-sidecar"),
        PathBuf::from("../whatsapp-sidecar"),
    ];
    candidates
        .into_iter()
        .find(|p| p.join("server.js").exists())
        .unwrap_or_else(|| PathBuf::from("whatsapp-sidecar"))
}

/// Find node.exe: bundled → known Windows install paths → PATH.
/// Tauri's child process may not inherit updated PATH after Node.js install,
/// so we check absolute paths explicitly.
fn find_node_exe(app: &AppHandle) -> Option<PathBuf> {
    // 1. Our own bundled node (downloaded via download_nodejs)
    let bundled = bundled_node_path(app);
    if bundled.exists() {
        return Some(bundled);
    }

    // 2. Common Windows install locations (system + user installers)
    let candidates: Vec<PathBuf> = {
        let mut v = vec![
            PathBuf::from(r"C:\Program Files\nodejs\node.exe"),
            PathBuf::from(r"C:\Program Files (x86)\nodejs\node.exe"),
        ];
        // User-scoped installer: %LOCALAPPDATA%\Programs\nodejs\node.exe
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            v.push(PathBuf::from(&local).join("Programs").join("nodejs").join("node.exe"));
        }
        // nvm-windows: %APPDATA%\nvm\
        if let Ok(appdata) = std::env::var("APPDATA") {
            let nvm_root = PathBuf::from(&appdata).join("nvm");
            if nvm_root.exists() {
                // pick the first version dir that has node.exe
                if let Ok(entries) = std::fs::read_dir(&nvm_root) {
                    for entry in entries.flatten() {
                        let node = entry.path().join("node.exe");
                        if node.exists() {
                            v.push(node);
                        }
                    }
                }
            }
        }
        // volta: %LOCALAPPDATA%\Volta\bin\node.exe
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            v.push(PathBuf::from(&local).join("Volta").join("bin").join("node.exe"));
        }
        v
    };

    for path in &candidates {
        if path.exists() {
            // Verify it actually runs
            if Command::new(path).arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
                return Some(path.clone());
            }
        }
    }

    // 3. PATH lookup (works if Tauri was launched from a terminal with node in PATH)
    let node_in_path = if cfg!(windows) { "node.exe" } else { "node" };
    if Command::new(node_in_path).arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        return Some(PathBuf::from(node_in_path));
    }

    None
}

/// Check whether Node.js is available (bundled or system).
#[tauri::command]
pub fn check_nodejs(app: AppHandle) -> Option<String> {
    let node = find_node_exe(&app)?;
    Command::new(&node)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
}

/// Download portable node.exe from nodejs.org and save to AppData.
/// Returns "ok" on success or an error string.
#[tauri::command]
pub async fn download_nodejs(app: AppHandle) -> Result<String, String> {
    let dest = bundled_node_path(&app);
    if dest.exists() {
        return Ok("already_installed".to_string());
    }

    // Create directory
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Download zip
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let bytes = client
        .get(NODE_ZIP_URL)
        .send()
        .await
        .map_err(|e| format!("Download-Fehler: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("Lese-Fehler: {}", e))?;

    // Extract node.exe + npm-cli.js from zip
    let cursor = std::io::Cursor::new(bytes.as_ref());
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("ZIP-Fehler: {}", e))?;

    let node_dir = dest.parent().unwrap().to_path_buf();

    // Files we need from the zip
    let want: &[(&str, &str)] = &[
        ("node.exe", "node.exe"),
        ("node_modules/npm/bin/npm-cli.js", "npm-cli.js"),
    ];

    for (zip_rel, local_name) in want {
        let zip_path = format!("{}/{}", NODE_PREFIX, zip_rel);
        if let Ok(mut entry) = archive.by_name(&zip_path) {
            let local_dest = node_dir.join(local_name);
            if let Some(p) = local_dest.parent() { std::fs::create_dir_all(p).ok(); }
            let mut out = std::fs::File::create(&local_dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
    }

    if !dest.exists() {
        return Err("node.exe konnte nicht extrahiert werden".to_string());
    }

    Ok("downloaded".to_string())
}

/// Find npm next to node.exe (Windows: npm.cmd; Unix: npm).
fn find_npm(node: &PathBuf) -> Option<PathBuf> {
    let node_dir = node.parent()?;
    // Windows npm launchers
    for name in &["npm.cmd", "npm"] {
        let p = node_dir.join(name);
        if p.exists() { return Some(p); }
    }
    // Bundled: node -e "require('child_process').execSync('npm')" won't work,
    // but npm-cli.js in node_modules/npm/bin/ might be there
    let cli = node_dir.join("node_modules").join("npm").join("bin").join("npm-cli.js");
    if cli.exists() { return Some(cli); }
    // System npm in PATH
    let sys_npm = if cfg!(windows) { "npm.cmd" } else { "npm" };
    if Command::new(sys_npm).arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        return Some(PathBuf::from(sys_npm));
    }
    None
}

/// Install npm dependencies for whatsapp-sidecar if node_modules is missing.
/// Returns "ok" or "already_installed".
#[tauri::command]
pub fn setup_whatsapp_deps(app: AppHandle) -> Result<String, String> {
    let dir = whatsapp_sidecar_dir();
    let nm = dir.join("node_modules");
    if nm.exists() {
        return Ok("already_installed".to_string());
    }

    let node = find_node_exe(&app)
        .ok_or_else(|| "Node.js nicht gefunden".to_string())?;

    let npm = find_npm(&node);

    let status = if let Some(ref npm_path) = npm {
        let ext = npm_path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext == "js" {
            // It's npm-cli.js — run via node
            Command::new(&node)
                .args([npm_path.to_str().unwrap(), "install", "--omit=dev"])
                .current_dir(&dir)
                .status()
                .map_err(|e| format!("npm install fehlgeschlagen: {}", e))?
        } else {
            Command::new(npm_path)
                .args(["install", "--omit=dev"])
                .current_dir(&dir)
                .status()
                .map_err(|e| format!("npm install fehlgeschlagen: {}", e))?
        }
    } else {
        return Err(
            "npm nicht gefunden. Bitte Node.js neu installieren oder neu starten.".to_string(),
        );
    };

    if !status.success() {
        return Err("npm install fehlgeschlagen. Bitte Internetverbindung prüfen.".to_string());
    }
    Ok("ok".to_string())
}

pub struct WhatsAppProcess(pub Mutex<Option<Child>>);

#[tauri::command]
pub fn start_whatsapp_sidecar(
    app: AppHandle,
    state: State<'_, WhatsAppProcess>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Already running?
    if let Some(ref mut child) = *guard {
        if child.try_wait().map(|s| s.is_none()).unwrap_or(false) {
            return Ok(());
        }
    }

    let node = find_node_exe(&app)
        .ok_or_else(|| "Node.js nicht gefunden. Bitte installieren.".to_string())?;

    let dir = whatsapp_sidecar_dir();

    let child = Command::new(&node)
        .arg("server.js")
        .current_dir(&dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Sidecar konnte nicht gestartet werden: {}", e))?;

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
pub async fn whatsapp_call(
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
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
            "WhatsApp-Sidecar nicht erreichbar.".to_string()
        } else {
            e.to_string()
        }
    })?;

    resp.json::<Value>().await.map_err(|e| e.to_string())
}
