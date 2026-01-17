use tauri::AppHandle;

use crate::license::{
    activate_license as core_activate_license,
    clear_license as core_clear_license,
    get_capabilities as core_get_capabilities,
    get_license_status as core_get_license_status,
    LicenseClaims,
    LicenseToken,
    Plan,
    Capabilities,
    LicenseStatus,
    now_unix,
};

use base64::engine::general_purpose::URL_SAFE;
use base64::Engine;

#[tauri::command]
pub fn get_license_status(app: AppHandle) -> LicenseStatus {
    core_get_license_status(&app)
}

#[tauri::command]
pub fn get_capabilities(app: AppHandle) -> Capabilities {
    let caps = core_get_capabilities(&app);
    println!("[License] Reporting capabilities: {:?}", caps);
    caps
}

#[tauri::command]
pub fn activate_license(app: AppHandle, token: LicenseToken) -> Result<(), String> {
    core_activate_license(&app, token)
}

#[tauri::command]
pub fn clear_license_cmd(app: AppHandle) -> Result<(), String> {
    println!("[License] Clearing local license (server says inactive)");
    let res = core_clear_license(&app);
    println!("[License] Clear license result: {:?}", res);
    res
}

#[tauri::command]
pub fn set_license_from_server(
    app: AppHandle,
    email: String,
    plan: String,
    exp: Option<u64>,
) -> Result<(), String> {
    println!("[License] set_license_from_server invoked");
    let normalized = plan.to_lowercase();
    let plan_enum = match normalized.as_str() {
        "pro" => Plan::Pro,
        _ => Plan::Free,
    };

    let claims = LicenseClaims {
        email,
        plan: plan_enum,
        iat: now_unix(),
        exp,
        lic: "supabase".to_string(),
        aud: None,
    };

    let json = serde_json::to_string(&claims)
        .map_err(|_| "failed_to_serialize_claims")?;

    let payload = URL_SAFE.encode(json.as_bytes());

    let token = LicenseToken {
        payload,
        signature: "server-trusted".to_string(),
    };

    println!("[License] Installing license into ClipAgent: {}", plan);

    println!("[License] Overwriting any existing local license");
    let res = core_activate_license(&app, token);
    println!("[License] License install result: {:?}", res);
    res
}