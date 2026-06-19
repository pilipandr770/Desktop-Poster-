use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub notes: Option<String>,
    pub download_url: Option<String>,
}

/// Check GitHub for a newer version. Returns UpdateInfo.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();

    let updater = app
        .updater()
        .map_err(|e| format!("Updater nicht verfügbar: {}", e))?;

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateInfo {
            available: true,
            current_version: current,
            latest_version: Some(update.version.clone()),
            notes: update.body.clone(),
            download_url: None,
        }),
        Ok(None) => Ok(UpdateInfo {
            available: false,
            current_version: current,
            latest_version: None,
            notes: None,
            download_url: None,
        }),
        Err(e) => Err(format!("Update-Prüfung fehlgeschlagen: {}", e)),
    }
}

/// Download and install the pending update, then restart.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| format!("Updater nicht verfügbar: {}", e))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Prüfung fehlgeschlagen: {}", e))?
        .ok_or_else(|| "Kein Update verfügbar".to_string())?;

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("Installation fehlgeschlagen: {}", e))?;

    // Restart the app to apply the update
    app.restart();
}
