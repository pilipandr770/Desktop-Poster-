use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseInfo {
    pub token: Option<String>,
    pub plan: Option<String>,
    pub valid_until: Option<String>,
    pub is_valid: bool,
}
