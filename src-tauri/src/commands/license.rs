use crate::db::AppDb;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub is_valid: bool,
    pub plan: Option<String>,
    pub valid_until: Option<String>,
    pub message: String,
}

#[tauri::command]
pub async fn check_license(db: State<'_, AppDb>) -> Result<LicenseStatus, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT token, plan, valid_until FROM license WHERE id = 1",
        [],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        },
    );

    match result {
        Err(_) => Ok(LicenseStatus {
            is_valid: false,
            plan: None,
            valid_until: None,
            message: "Keine Lizenz aktiviert. Bitte Lizenzschlüssel eingeben.".to_string(),
        }),
        Ok((token, plan, valid_until)) => {
            if token.is_none() {
                return Ok(LicenseStatus {
                    is_valid: false,
                    plan: None,
                    valid_until: None,
                    message: "Keine Lizenz aktiviert.".to_string(),
                });
            }

            let is_valid = valid_until
                .as_ref()
                .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc) > chrono::Utc::now())
                .unwrap_or(false);

            let plan_label = plan
                .as_deref()
                .unwrap_or("Solo")
                .to_uppercase();

            Ok(LicenseStatus {
                message: if is_valid {
                    format!("Lizenz aktiv — Plan: {}", plan_label)
                } else {
                    "Lizenz abgelaufen. Bitte erneuern.".to_string()
                },
                is_valid,
                plan,
                valid_until,
            })
        }
    }
}

#[tauri::command]
pub async fn activate_license(
    db: State<'_, AppDb>,
    token: String,
) -> Result<LicenseStatus, String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("Ungültiger Lizenzschlüssel".to_string());
    }

    // TODO: Verify token against license server (https://license.crosspost-desktop.de/verify)
    // For now: accept any non-empty token → Solo plan, 1 year validity
    let plan = determine_plan_from_token(&token);
    let valid_until = (chrono::Utc::now() + chrono::Duration::days(365)).to_rfc3339();

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO license (id, token, plan, valid_until, last_check)
         VALUES (1, ?1, ?2, ?3, datetime('now'))",
        params![token, plan, valid_until],
    )
    .map_err(|e| e.to_string())?;

    Ok(LicenseStatus {
        is_valid: true,
        plan: Some(plan.to_string()),
        valid_until: Some(valid_until),
        message: format!("Lizenz erfolgreich aktiviert! Plan: {}", plan.to_uppercase()),
    })
}

/// Simple heuristic until real server verification is implemented.
fn determine_plan_from_token(token: &str) -> &'static str {
    if token.starts_with("AGENCY-") {
        "agency"
    } else if token.starts_with("PRO-") {
        "pro"
    } else {
        "solo"
    }
}
