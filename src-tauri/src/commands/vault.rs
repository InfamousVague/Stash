use crate::state::AppState;

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
    let mut vault_key = state.vault_key.lock().unwrap();
    *vault_key = Some(key);
    Ok(())
}

#[tauri::command]
pub fn unlock_vault_cmd(state: tauri::State<'_, AppState>, password: String) -> Result<(), String> {
    let key = crate::vault::unlock_vault(&password, &state.stash_dir)?;
    crate::session::write_session(&key);
    let mut vault_key = state.vault_key.lock().unwrap();
    *vault_key = Some(key);
    Ok(())
}

#[tauri::command]
pub fn lock_vault(state: tauri::State<'_, AppState>) {
    let mut vault_key = state.vault_key.lock().unwrap();
    *vault_key = None;
    crate::session::clear_session();
    log::info!("Vault locked");
}
