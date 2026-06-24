use crate::db::AppDb;
use base64::{engine::general_purpose, Engine as _};
use rusqlite::params;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

const META_APP_ID: &str = "1696429314893660";
const REDIRECT_URI: &str = "http://localhost:8080";

// Embedded at compile time from META_APP_SECRET env var (set in CI from GitHub Secrets).
macro_rules! meta_app_secret_builtin {
    () => {
        match option_env!("META_APP_SECRET") {
            Some(v) => v,
            None => "",
        }
    };
}

// Embedded at compile time from GOOGLE_CLIENT_ID env var (set in CI from GitHub Secrets).
macro_rules! google_client_id_builtin {
    () => {
        match option_env!("GOOGLE_CLIENT_ID") {
            Some(v) => v,
            None => "",
        }
    };
}

fn oauth_scope(platform: &str) -> &str {
    match platform {
        "instagram" => {
            "instagram_basic,instagram_manage_messages,instagram_content_publish,pages_show_list,pages_read_engagement"
        }
        "facebook" => {
            "pages_manage_posts,pages_read_engagement,pages_messaging,pages_show_list"
        }
        _ => "public_profile",
    }
}

/// Opens system browser for Meta OAuth, catches redirect on localhost:8080,
/// exchanges code for long-lived token, fetches profile, saves to DB.
#[tauri::command]
pub async fn start_meta_oauth(
    app: AppHandle,
    platform: String,
) -> Result<Value, String> {
    // Prefer compile-time constant; fall back to runtime DB setting
    let builtin_secret = meta_app_secret_builtin!();
    let app_secret = if !builtin_secret.is_empty() {
        builtin_secret.to_string()
    } else {
        let db = app.state::<AppDb>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'meta_app_secret'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default()
    };

    if app_secret.is_empty() {
        return Err(
            "Meta App Secret nicht konfiguriert. Bitte in Einstellungen → Entwickler eintragen."
                .to_string(),
        );
    }

    let scope = oauth_scope(&platform);
    let state_token = Uuid::new_v4().to_string();

    let oauth_url = format!(
        "https://www.facebook.com/dialog/oauth?client_id={}&redirect_uri={}&scope={}&response_type=code&state={}",
        META_APP_ID,
        urlencoding::encode(REDIRECT_URI),
        scope,
        state_token
    );

    // Open system browser
    app.opener().open_url(&oauth_url, None::<&str>).map_err(|e| e.to_string())?;

    // Wait for OAuth redirect on localhost:8080 (blocking, in spawn_blocking)
    let code = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let listener = TcpListener::bind("127.0.0.1:8080")
            .map_err(|e| format!("Port 8080 belegt: {}", e))?;

        let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;

        let mut reader = BufReader::new(&stream);
        let mut request_line = String::new();
        reader.read_line(&mut request_line).map_err(|e| e.to_string())?;

        // GET /?code=ABC&state=XYZ HTTP/1.1
        let code = extract_code_from_request(&request_line)?;

        // Send success page to browser
        let html = "<html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;text-align:center;padding:60px'>\
            <h2 style='color:#4CAF50'>✅ Erfolgreich verbunden!</h2>\
            <p>Sie können dieses Fenster jetzt schließen und zu CrossPost Desktop zurückkehren.</p>\
            </body></html>";
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(), html
        );
        stream.flush().ok();
        Ok(code)
    })
    .await
    .map_err(|e| e.to_string())??;

    // Exchange authorization code for short-lived token
    let client = reqwest::Client::new();

    let token_resp: Value = client
        .get("https://graph.facebook.com/v19.0/oauth/access_token")
        .query(&[
            ("client_id", META_APP_ID),
            ("redirect_uri", REDIRECT_URI),
            ("client_secret", &app_secret),
            ("code", &code),
        ])
        .send()
        .await
        .map_err(|e| format!("Token-Anfrage fehlgeschlagen: {}", e))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(err) = token_resp.get("error") {
        return Err(format!("Meta OAuth Fehler: {}", err));
    }

    let short_token = token_resp["access_token"]
        .as_str()
        .ok_or("Kein access_token erhalten")?
        .to_string();

    // Exchange for long-lived token (60 days)
    let long_resp: Value = client
        .get("https://graph.facebook.com/v19.0/oauth/access_token")
        .query(&[
            ("grant_type", "fb_exchange_token"),
            ("client_id", META_APP_ID),
            ("client_secret", &app_secret),
            ("fb_exchange_token", &short_token),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let long_token = long_resp["access_token"]
        .as_str()
        .unwrap_or(&short_token)
        .to_string();

    // Get Facebook profile
    let profile: Value = client
        .get("https://graph.facebook.com/v19.0/me")
        .query(&[("fields", "id,name,picture"), ("access_token", &long_token)])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let fb_name = profile["name"].as_str().unwrap_or("Facebook User").to_string();
    let fb_id = profile["id"].as_str().unwrap_or("").to_string();

    // For Instagram: find connected IG Business account via Pages
    let (display_name, username, final_token, ig_user_id) = if platform == "instagram" {
        resolve_instagram_account(&client, &long_token, &fb_name).await?
    } else {
        (fb_name, None, long_token.clone(), fb_id.clone())
    };

    // Save account to DB
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let account_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let creds = serde_json::json!({
        "access_token": final_token,
        "user_id": ig_user_id,
        "fb_user_id": fb_id,
        "platform": platform
    });
    let creds_json = serde_json::to_string(&creds).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO accounts (id, platform, display_name, username, stronghold_key, status, last_sync)
         VALUES (?1, ?2, ?3, ?4, ?5, 'connected', ?6)",
        params![
            account_id,
            platform,
            display_name,
            username,
            format!("account_{}", account_id),
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![format!("creds_{}", account_id), creds_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "account": {
            "id": account_id,
            "platform": platform,
            "display_name": display_name,
            "username": username,
            "status": "connected"
        }
    }))
}

async fn resolve_instagram_account(
    client: &reqwest::Client,
    long_token: &str,
    fallback_name: &str,
) -> Result<(String, Option<String>, String, String), String> {
    // Get Facebook Pages managed by the user
    let pages: Value = client
        .get("https://graph.facebook.com/v19.0/me/accounts")
        .query(&[("access_token", long_token)])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let page_list = pages["data"].as_array().cloned().unwrap_or_default();

    for page in &page_list {
        let page_token = page["access_token"].as_str().unwrap_or(long_token);
        let page_id = match page["id"].as_str() {
            Some(id) => id,
            None => continue,
        };

        // Check if this page has a linked IG Business account
        let ig_link: Value = client
            .get(format!("https://graph.facebook.com/v19.0/{}", page_id))
            .query(&[
                ("fields", "instagram_business_account"),
                ("access_token", page_token),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        if let Some(ig_id) = ig_link["instagram_business_account"]["id"].as_str() {
            let ig_profile: Value = client
                .get(format!("https://graph.facebook.com/v19.0/{}", ig_id))
                .query(&[
                    ("fields", "username,name"),
                    ("access_token", page_token),
                ])
                .send()
                .await
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;

            let name = ig_profile["name"]
                .as_str()
                .unwrap_or(fallback_name)
                .to_string();
            let username = ig_profile["username"].as_str().map(|s| s.to_string());
            return Ok((name, username, page_token.to_string(), ig_id.to_string()));
        }
    }

    // No IG Business account found — still save as Facebook user
    Err(
        "Kein verknüpftes Instagram Business-Konto gefunden. \
         Bitte verbinden Sie Instagram mit Ihrer Facebook-Seite."
            .to_string(),
    )
}

// ─── Google OAuth 2.0 PKCE ───────────────────────────────────────────────────

const GOOGLE_REDIRECT_URI: &str = "http://127.0.0.1:8082/callback";

/// Opens system browser for Google OAuth 2.0 PKCE flow (Gmail).
/// Catches redirect on localhost:8082, exchanges code for token, saves to DB.
#[tauri::command]
pub async fn start_google_oauth(app: AppHandle) -> Result<Value, String> {
    let builtin = google_client_id_builtin!();
    let client_id = if !builtin.is_empty() {
        builtin.to_string()
    } else {
        let db = app.state::<AppDb>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'google_client_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default()
    };

    if client_id.is_empty() {
        return Err(
            "Google Client ID nicht konfiguriert. Bitte in Einstellungen → Entwickler eintragen."
                .to_string(),
        );
    }

    // PKCE: code_verifier = two UUIDs concatenated as hex (64 URL-safe chars)
    let code_verifier = format!(
        "{}{}",
        Uuid::new_v4().to_string().replace('-', ""),
        Uuid::new_v4().to_string().replace('-', "")
    );

    // code_challenge = BASE64URL(SHA256(code_verifier))
    let hash = Sha256::digest(code_verifier.as_bytes());
    let code_challenge = general_purpose::URL_SAFE_NO_PAD.encode(hash);

    let state_token = Uuid::new_v4().to_string();

    let scope = urlencoding::encode(
        "https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
    );

    let oauth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        client_id,
        urlencoding::encode(GOOGLE_REDIRECT_URI),
        scope,
        state_token,
        code_challenge
    );

    app.opener()
        .open_url(&oauth_url, None::<&str>)
        .map_err(|e| e.to_string())?;

    // Wait for OAuth redirect on localhost:8082
    let code = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let listener = TcpListener::bind("127.0.0.1:8082")
            .map_err(|e| format!("Port 8082 belegt: {}", e))?;

        let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;

        let mut reader = BufReader::new(&stream);
        let mut request_line = String::new();
        reader
            .read_line(&mut request_line)
            .map_err(|e| e.to_string())?;

        let code = extract_code_from_request(&request_line)?;

        let html = "<html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;text-align:center;padding:60px'>\
            <h2 style='color:#4CAF50'>✅ Gmail erfolgreich verbunden!</h2>\
            <p>Sie können dieses Fenster jetzt schließen und zu CrossPost Desktop zurückkehren.</p>\
            </body></html>";
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        );
        stream.flush().ok();
        Ok(code)
    })
    .await
    .map_err(|e| e.to_string())??;

    let http = reqwest::Client::new();

    // Exchange code for tokens (Desktop app PKCE — no client_secret needed)
    let token_resp: Value = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", GOOGLE_REDIRECT_URI),
            ("code_verifier", code_verifier.as_str()),
            ("client_id", client_id.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Token-Anfrage fehlgeschlagen: {}", e))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(err) = token_resp.get("error") {
        let desc = token_resp
            .get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return Err(format!("Google OAuth Fehler: {} — {}", err, desc));
    }

    let access_token = token_resp["access_token"]
        .as_str()
        .ok_or("Kein access_token erhalten")?
        .to_string();

    let refresh_token = token_resp["refresh_token"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Get Google user info
    let user_resp: Value = http
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let display_name = user_resp["name"]
        .as_str()
        .unwrap_or("Gmail User")
        .to_string();
    let email = user_resp["email"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Save account to DB
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let account_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let creds = serde_json::json!({
        "google_oauth_token": access_token,
        "refresh_token": refresh_token,
        "email": email,
        "platform": "gmail"
    });
    let creds_json = serde_json::to_string(&creds).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO accounts (id, platform, display_name, username, stronghold_key, status, last_sync)
         VALUES (?1, ?2, ?3, ?4, ?5, 'connected', ?6)",
        params![
            account_id,
            "gmail",
            display_name,
            email,
            format!("account_{}", account_id),
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![format!("creds_{}", account_id), creds_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "account": {
            "id": account_id,
            "platform": "gmail",
            "display_name": display_name,
            "username": email,
            "status": "connected"
        }
    }))
}

fn extract_code_from_request(request_line: &str) -> Result<String, String> {
    // "GET /?code=ABC123&state=XYZ HTTP/1.1"
    let path_end = request_line.find(" HTTP").unwrap_or(request_line.len());
    let path = &request_line[..path_end];

    if let Some(q) = path.find('?') {
        for pair in path[q + 1..].split('&') {
            let mut kv = pair.splitn(2, '=');
            if let (Some("code"), Some(val)) = (kv.next(), kv.next()) {
                return Ok(urlencoding::decode(val)
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|_| val.to_string()));
            }
        }
    }

    Err("Kein Autorisierungscode im Redirect erhalten".to_string())
}

// ─── Twitter / X OAuth 2.0 PKCE ──────────────────────────────────────────────

const TWITTER_REDIRECT_URI: &str = "http://127.0.0.1:8081/callback";

// Embedded at compile time from TWITTER_CLIENT_ID env var (set in CI from GitHub Secrets).
// Falls back to DB setting for local dev.
macro_rules! twitter_client_id_builtin {
    () => {
        match option_env!("TWITTER_CLIENT_ID") {
            Some(v) => v,
            None => "",
        }
    };
}

/// Opens system browser for Twitter OAuth 2.0 PKCE flow.
/// Catches redirect on localhost:8081, exchanges code for token, saves to DB.
#[tauri::command]
pub async fn start_twitter_oauth(app: AppHandle) -> Result<Value, String> {
    // Prefer compile-time constant; fall back to runtime DB setting
    let builtin = twitter_client_id_builtin!();
    let client_id = if !builtin.is_empty() {
        builtin.to_string()
    } else {
        let db = app.state::<AppDb>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'twitter_client_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default()
    };

    if client_id.is_empty() {
        return Err(
            "Twitter Client ID nicht konfiguriert. Bitte in Einstellungen → Entwickler eintragen \
             (developer.twitter.com → App → OAuth 2.0 Client ID)."
                .to_string(),
        );
    }

    // PKCE: code_verifier = two UUIDs concatenated as hex (64 URL-safe chars)
    let code_verifier = format!(
        "{}{}",
        Uuid::new_v4().to_string().replace('-', ""),
        Uuid::new_v4().to_string().replace('-', "")
    );

    // code_challenge = BASE64URL(SHA256(code_verifier))
    let hash = Sha256::digest(code_verifier.as_bytes());
    let code_challenge = general_purpose::URL_SAFE_NO_PAD.encode(hash);

    let state_token = Uuid::new_v4().to_string();

    let oauth_url = format!(
        "https://twitter.com/i/oauth2/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        client_id,
        urlencoding::encode(TWITTER_REDIRECT_URI),
        urlencoding::encode("tweet.read tweet.write users.read offline.access"),
        state_token,
        code_challenge
    );

    app.opener()
        .open_url(&oauth_url, None::<&str>)
        .map_err(|e| e.to_string())?;

    // Wait for OAuth redirect on localhost:8081 (port 8080 is used by Meta)
    let code = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let listener = TcpListener::bind("127.0.0.1:8081")
            .map_err(|e| format!("Port 8081 belegt: {}", e))?;

        let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;

        let mut reader = BufReader::new(&stream);
        let mut request_line = String::new();
        reader
            .read_line(&mut request_line)
            .map_err(|e| e.to_string())?;

        let code = extract_code_from_request(&request_line)?;

        let html = "<html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;text-align:center;padding:60px'>\
            <h2 style='color:#4CAF50'>✅ Twitter / X erfolgreich verbunden!</h2>\
            <p>Sie können dieses Fenster jetzt schließen und zu CrossPost Desktop zurückkehren.</p>\
            </body></html>";
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        );
        stream.flush().ok();
        Ok(code)
    })
    .await
    .map_err(|e| e.to_string())??;

    let http = reqwest::Client::new();

    // Exchange code for user access token (no client_secret for PKCE public app)
    let token_resp: Value = http
        .post("https://api.twitter.com/2/oauth2/token")
        .basic_auth(&client_id, Option::<&str>::None)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", TWITTER_REDIRECT_URI),
            ("code_verifier", code_verifier.as_str()),
            ("client_id", client_id.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Token-Anfrage fehlgeschlagen: {}", e))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(err) = token_resp.get("error") {
        let desc = token_resp
            .get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return Err(format!("Twitter OAuth Fehler: {} — {}", err, desc));
    }

    let access_token = token_resp["access_token"]
        .as_str()
        .ok_or("Kein access_token erhalten")?
        .to_string();

    let refresh_token = token_resp["refresh_token"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Get Twitter user info
    let user_resp: Value = http
        .get("https://api.twitter.com/2/users/me?user.fields=name,username")
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let twitter_name = user_resp["data"]["name"]
        .as_str()
        .unwrap_or("Twitter User")
        .to_string();
    let twitter_username = user_resp["data"]["username"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Save account to DB
    let db = app.state::<AppDb>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let account_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let creds = serde_json::json!({
        "oauth2_token": access_token,
        "refresh_token": refresh_token,
        "platform": "twitter"
    });
    let creds_json = serde_json::to_string(&creds).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO accounts (id, platform, display_name, username, stronghold_key, status, last_sync)
         VALUES (?1, ?2, ?3, ?4, ?5, 'connected', ?6)",
        params![
            account_id,
            "twitter",
            twitter_name,
            twitter_username,
            format!("account_{}", account_id),
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![format!("creds_{}", account_id), creds_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "account": {
            "id": account_id,
            "platform": "twitter",
            "display_name": twitter_name,
            "username": twitter_username,
            "status": "connected"
        }
    }))
}
