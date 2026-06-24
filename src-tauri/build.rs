fn main() {
    // Expose OAuth client IDs and secrets from env to Rust code via env! macro
    for key in &["TWITTER_CLIENT_ID", "META_APP_SECRET", "GOOGLE_CLIENT_ID"] {
        if let Ok(val) = std::env::var(key) {
            if !val.is_empty() {
                println!("cargo:rustc-env={}={}", key, val);
            }
        }
    }
    tauri_build::build()
}
