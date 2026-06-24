fn main() {
    // Expose TWITTER_CLIENT_ID from env to Rust code via env! macro
    if let Ok(id) = std::env::var("TWITTER_CLIENT_ID") {
        if !id.is_empty() {
            println!("cargo:rustc-env=TWITTER_CLIENT_ID={}", id);
        }
    }
    tauri_build::build()
}
