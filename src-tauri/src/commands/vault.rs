use crate::state::AppState;
use base64::Engine;

#[tauri::command]
pub fn check_vault_initialized(state: tauri::State<'_, AppState>) -> bool {
    crate::vault::is_vault_initialized(&state.stash_dir)
}

#[tauri::command]
pub fn check_vault_unlocked(state: tauri::State<'_, AppState>) -> bool {
    state.is_unlocked()
}

#[tauri::command]
pub fn init_vault_cmd(state: tauri::State<'_, AppState>, password: String) -> Result<(), String> {
    let key = crate::vault::init_vault(&password, &state.stash_dir)?;
    crate::session::write_session(&key);
    let mut vault_key = state.vault_key.lock()
        .map_err(|_| "Lock poisoned".to_string())?;
    *vault_key = Some(key);
    Ok(())
}

#[tauri::command]
pub fn unlock_vault_cmd(state: tauri::State<'_, AppState>, password: String) -> Result<(), String> {
    let key = crate::vault::unlock_vault(&password, &state.stash_dir)?;
    crate::session::write_session(&key);
    let mut vault_key = state.vault_key.lock()
        .map_err(|_| "Lock poisoned".to_string())?;
    *vault_key = Some(key);
    Ok(())
}

#[tauri::command]
pub fn lock_vault(state: tauri::State<'_, AppState>) {
    if let Ok(mut vault_key) = state.vault_key.lock() {
        *vault_key = None;
    }
    crate::session::clear_session();
    log::info!("Vault locked");
}

// ── Keychain commands ─────────────────────────────────────

#[tauri::command]
pub fn store_key_in_keychain(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Verify biometric is available and prompt the user
    prompt_biometric("Stash wants to enable Touch ID")?;

    let vault_key = state.vault_key.lock()
        .map_err(|_| "Lock poisoned".to_string())?;
    let key = vault_key.ok_or("Vault is not unlocked")?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(key);

    // Store the key in a local file (protected by Touch ID prompt on read)
    let key_path = std::path::Path::new(&state.stash_dir).join("touchid_key");
    std::fs::write(&key_path, &b64)
        .map_err(|e| format!("Failed to store key: {}", e))?;

    // Restrictive permissions
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600)).ok();
    }

    // Write flag file
    let flag_path = std::path::Path::new(&state.stash_dir).join("keychain_enabled");
    std::fs::write(&flag_path, "1").ok();

    log::info!("Vault key stored for Touch ID unlock");
    Ok(())
}

/// Find the stash-touchid helper binary.
fn find_touchid_helper() -> Option<std::path::PathBuf> {
    // Check alongside the current executable (release builds)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("stash-touchid");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    // Dev mode: check helpers directory
    let dev_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("helpers/stash-touchid");
    if dev_path.exists() {
        return Some(dev_path);
    }
    None
}

/// Prompt the user for biometric authentication (Touch ID on macOS).
/// Uses a pre-compiled Swift helper binary.
fn prompt_biometric(reason: &str) -> Result<(), String> {
    let helper = find_touchid_helper()
        .ok_or("Touch ID helper not found")?;

    let output = std::process::Command::new(&helper)
        .arg(reason)
        .output()
        .map_err(|e| format!("Failed to run Touch ID: {}", e))?;

    match output.status.code() {
        Some(0) => Ok(()),
        Some(1) => Err("Touch ID is not available on this device".to_string()),
        Some(2) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Touch ID cancelled: {}", stderr.trim()))
        }
        _ => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Touch ID failed: {}", stderr.trim()))
        }
    }
}

/// Check if biometric authentication (Touch ID) is available on this device.
fn check_biometric_available() -> bool {
    find_touchid_helper()
        .and_then(|helper| {
            std::process::Command::new(&helper)
                .arg("--check")
                .output()
                .ok()
        })
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn unlock_vault_from_keychain(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Prompt for biometric authentication
    prompt_biometric("Stash wants to unlock your vault")?;

    // Biometric succeeded — read the key from our stored file
    let key_path = std::path::Path::new(&state.stash_dir).join("touchid_key");
    let b64 = std::fs::read_to_string(&key_path)
        .map_err(|_| "No Touch ID key found — please unlock with your password".to_string())?;

    let key_bytes = base64::engine::general_purpose::STANDARD.decode(b64.trim())
        .map_err(|_| "Invalid stored key data".to_string())?;

    if key_bytes.len() != 32 {
        std::fs::remove_file(&key_path).ok();
        let flag_path = std::path::Path::new(&state.stash_dir).join("keychain_enabled");
        std::fs::remove_file(&flag_path).ok();
        return Err("Invalid stored key — please unlock with your password".to_string());
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);

    // Verify the key works
    let vault_path = format!("{}/vault.enc", state.stash_dir);
    let encrypted = std::fs::read(&vault_path)
        .map_err(|e| format!("Failed to read vault: {}", e))?;

    crate::vault::decrypt_with_key(&encrypted, &key).map_err(|_| {
        std::fs::remove_file(&key_path).ok();
        let flag_path = std::path::Path::new(&state.stash_dir).join("keychain_enabled");
        std::fs::remove_file(&flag_path).ok();
        "Stored key is invalid — please unlock with your password".to_string()
    })?;

    crate::session::write_session(&key);
    let mut vault_key = state.vault_key.lock()
        .map_err(|_| "Lock poisoned".to_string())?;
    *vault_key = Some(key);

    log::info!("Vault unlocked via Touch ID");
    Ok(())
}

#[tauri::command]
pub fn is_biometric_available() -> bool {
    check_biometric_available()
}

#[tauri::command]
pub fn has_keychain_key(state: tauri::State<'_, AppState>) -> bool {
    // Check the flag file instead of querying the keychain (which may prompt the user)
    let flag_path = std::path::Path::new(&state.stash_dir).join("keychain_enabled");
    flag_path.exists()
}

#[tauri::command]
pub fn clear_keychain_key(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Remove stored key file
    let key_path = std::path::Path::new(&state.stash_dir).join("touchid_key");
    std::fs::remove_file(&key_path).ok();

    // Remove flag file
    let flag_path = std::path::Path::new(&state.stash_dir).join("keychain_enabled");
    std::fs::remove_file(&flag_path).ok();

    log::info!("Touch ID key cleared");
    Ok(())
}
