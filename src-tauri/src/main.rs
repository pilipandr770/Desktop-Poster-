// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod license;
mod scheduler;

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::Manager;

    let show = MenuItemBuilder::with_id("show", "Anzeigen").build(app)?;
    let hide = MenuItemBuilder::with_id("hide", "Verbergen").build(app)?;
    let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Beenden").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&hide)
        .item(&sep)
        .item(&quit)
        .build()?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("CrossPost Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "hide" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                use argon2::Argon2;
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(commands::whatsapp::WhatsAppProcess(std::sync::Mutex::new(None)))
        .setup(|app| {
            use tauri::Manager;
            build_tray(app)?;

            // Minimize to tray on close instead of quitting
            let win = app.get_webview_window("main").unwrap();
            let win_clone = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win_clone.hide();
                }
            });

            let app_handle = app.handle().clone();
            let scheduler_handle = app.handle().clone();
            let win_for_startup = app.get_webview_window("main").unwrap();
            tauri::async_runtime::spawn(async move {
                db::initialize(&app_handle)
                    .await
                    .expect("Failed to initialize database");

                // After DB init: check start_minimized setting
                if let Some(db) = app_handle.try_state::<crate::db::AppDb>() {
                    let minimized = db.0.lock().ok()
                        .and_then(|c| c.query_row(
                            "SELECT value FROM settings WHERE key = 'start_minimized'",
                            [],
                            |r| r.get::<_, String>(0),
                        ).ok())
                        .map(|v| v == "1")
                        .unwrap_or(false);
                    if minimized {
                        let _ = win_for_startup.hide();
                    }
                }
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
            commands::settings::save_setting,
            commands::settings::open_external_url,
            // Sidecar
            commands::sidecar::start_python_sidecar,
            commands::sidecar::stop_python_sidecar,
            commands::sidecar::send_to_sidecar,
            commands::sidecar::generate_ai_content,
            // WhatsApp
            commands::whatsapp::start_whatsapp_sidecar,
            commands::whatsapp::stop_whatsapp_sidecar,
            commands::whatsapp::whatsapp_call,
            commands::whatsapp::check_nodejs,
            commands::whatsapp::install_nodejs,
            // Meta OAuth
            commands::oauth::start_meta_oauth,
            // Updater
            commands::updater::check_for_updates,
            commands::updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
