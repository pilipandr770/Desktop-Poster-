// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod commands;
mod db;
mod license;
mod scheduler;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                // argon2 v0.4 (RustCrypto) API
                use argon2::Argon2;
                // Salt must be exactly 16 bytes
                let salt = b"crosspost-salt-1";
                let mut key = vec![0u8; 32];
                Argon2::default()
                    .hash_password_into(password.as_ref(), salt, &mut key)
                    .expect("Failed to derive stronghold key");
                key
            })
            .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let scheduler_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                db::initialize(&app_handle)
                    .await
                    .expect("Failed to initialize database");
            });
            scheduler::start(scheduler_handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // License
            commands::license::check_license,
            commands::license::activate_license,
            // Accounts
            commands::accounts::get_accounts,
            commands::accounts::add_account,
            commands::accounts::remove_account,
            commands::accounts::update_account_status,
            // Messages
            commands::messages::get_messages,
            commands::messages::mark_as_read,
            commands::messages::send_reply,
            // Posts
            commands::posts::get_posts,
            commands::posts::create_scheduled_post,
            commands::posts::cancel_scheduled_post,
            commands::posts::post_content,
            // Settings
            commands::settings::get_settings,
            commands::settings::update_settings,
            // Sidecar
            commands::sidecar::start_python_sidecar,
            commands::sidecar::stop_python_sidecar,
            commands::sidecar::send_to_sidecar,
            commands::sidecar::generate_ai_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
