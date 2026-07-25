use crate::db::AppDb;
use crate::commands::sidecar::call_python;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

fn get_setting(db: &AppDb, key: &str) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    )
    .map_err(|_| format!("Setting '{}' not found", key))
}

fn media_dir(app: &AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("media");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

// ── Image generation ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_image(
    app: AppHandle,
    db: State<'_, AppDb>,
    prompt: String,
    provider: String,
    aspect_ratio: Option<String>,
) -> Result<Value, String> {
    let api_key = get_setting(&db, &format!("image_api_key_{}", provider))
        .or_else(|_| get_setting(&db, "image_api_key"))?;
    let output_dir = media_dir(&app)?;

    let cmd = serde_json::json!({
        "action": "generate_image",
        "platform": "media_image",
        "params": {
            "provider": provider,
            "api_key": api_key,
            "prompt": prompt,
            "aspect_ratio": aspect_ratio.unwrap_or_else(|| "1:1".to_string()),
            "output_dir": output_dir
        }
    });
    call_python(cmd)
}

// ── Avatar / talking-head video ───────────────────────────────────────────────

#[tauri::command]
pub async fn generate_avatar(
    app: AppHandle,
    db: State<'_, AppDb>,
    text: String,
    provider: Option<String>,
    avatar_id: Option<String>,
    voice_id: Option<String>,
) -> Result<Value, String> {
    let prov = provider.unwrap_or_else(|| "heygen".to_string());
    let api_key = get_setting(&db, &format!("avatar_api_key_{}", prov))
        .or_else(|_| get_setting(&db, "avatar_api_key"))?;
    let output_dir = media_dir(&app)?;

    let cmd = serde_json::json!({
        "action": "generate_avatar",
        "platform": "media_avatar",
        "params": {
            "provider": prov,
            "api_key": api_key,
            "text": text,
            "avatar_id": avatar_id.unwrap_or_default(),
            "voice_id": voice_id.unwrap_or_default(),
            "output_dir": output_dir
        }
    });
    call_python(cmd)
}

#[tauri::command]
pub async fn list_avatars(
    db: State<'_, AppDb>,
    provider: Option<String>,
) -> Result<Value, String> {
    let prov = provider.unwrap_or_else(|| "heygen".to_string());
    let api_key = get_setting(&db, &format!("avatar_api_key_{}", prov))
        .or_else(|_| get_setting(&db, "avatar_api_key"))
        .unwrap_or_default();

    let cmd = serde_json::json!({
        "action": "list_avatars",
        "platform": "media_avatar",
        "params": { "provider": prov, "api_key": api_key }
    });
    call_python(cmd)
}

// ── Video generation ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_video(
    app: AppHandle,
    db: State<'_, AppDb>,
    prompt: String,
    provider: Option<String>,
    image_path: Option<String>,
    duration: Option<i64>,
    ratio: Option<String>,
) -> Result<Value, String> {
    let prov = provider.unwrap_or_else(|| "runway".to_string());
    let api_key = get_setting(&db, &format!("video_api_key_{}", prov))
        .or_else(|_| get_setting(&db, "video_api_key"))?;
    let output_dir = media_dir(&app)?;

    let cmd = serde_json::json!({
        "action": "generate_video",
        "platform": "media_video",
        "params": {
            "provider": prov,
            "api_key": api_key,
            "prompt": prompt,
            "image_path": image_path.unwrap_or_default(),
            "duration": duration.unwrap_or(5),
            "ratio": ratio.unwrap_or_else(|| "1280:720".to_string()),
            "output_dir": output_dir
        }
    });
    call_python(cmd)
}

// ── Voice / TTS ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_voice(
    app: AppHandle,
    db: State<'_, AppDb>,
    text: String,
    provider: Option<String>,
    voice_id: Option<String>,
) -> Result<Value, String> {
    let prov = provider.unwrap_or_else(|| "elevenlabs".to_string());
    let api_key = get_setting(&db, &format!("voice_api_key_{}", prov))
        .or_else(|_| get_setting(&db, "voice_api_key"))?;
    let output_dir = media_dir(&app)?;

    let cmd = serde_json::json!({
        "action": "generate_voice",
        "platform": "media_voice",
        "params": {
            "provider": prov,
            "api_key": api_key,
            "text": text,
            "voice_id": voice_id.unwrap_or_default(),
            "output_dir": output_dir
        }
    });
    call_python(cmd)
}

#[tauri::command]
pub async fn list_voices(
    db: State<'_, AppDb>,
    provider: Option<String>,
) -> Result<Value, String> {
    let prov = provider.unwrap_or_else(|| "elevenlabs".to_string());
    let api_key = get_setting(&db, &format!("voice_api_key_{}", prov))
        .or_else(|_| get_setting(&db, "voice_api_key"))
        .unwrap_or_default();

    let cmd = serde_json::json!({
        "action": "list_voices",
        "platform": "media_voice",
        "params": { "provider": prov, "api_key": api_key }
    });
    call_python(cmd)
}

// ── List generated files ──────────────────────────────────────────────────────

#[tauri::command]
pub fn list_media_files(app: AppHandle) -> Result<Value, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("media");

    if !dir.exists() {
        return Ok(serde_json::json!({"files": []}));
    }

    let mut files: Vec<Value> = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let kind = match ext.as_str() {
            "jpg" | "jpeg" | "png" | "webp" => "image",
            "mp4" | "mov" | "webm"          => "video",
            "mp3" | "wav" | "ogg"           => "audio",
            _                               => "other",
        };
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        files.push(serde_json::json!({
            "path":     path.to_string_lossy(),
            "name":     entry.file_name().to_string_lossy(),
            "kind":     kind,
            "size":     meta.len(),
        }));
    }
    files.sort_by(|a, b| {
        let na = a["name"].as_str().unwrap_or("");
        let nb = b["name"].as_str().unwrap_or("");
        nb.cmp(na)
    });
    Ok(serde_json::json!({"files": files}))
}
