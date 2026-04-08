use crate::state::AppState;
use crate::config::{self, AppConfig};

#[tauri::command]
pub fn get_config(state: tauri::State<'_, AppState>) -> AppConfig {
    config::load_config(&state.stash_dir)
}

#[tauri::command]
pub fn save_config_cmd(state: tauri::State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    config::save_config(&state.stash_dir, &config)
}

#[tauri::command]
pub fn is_setup_complete(state: tauri::State<'_, AppState>) -> bool {
    config::load_config(&state.stash_dir).setup_complete
}

#[tauri::command]
pub fn complete_setup(
    state: tauri::State<'_, AppState>,
    scan_directories: Vec<String>,
) -> Result<(), String> {
    let mut cfg = config::load_config(&state.stash_dir);
    cfg.scan_directories = scan_directories;
    cfg.setup_complete = true;
    config::save_config(&state.stash_dir, &cfg)
}

#[tauri::command]
pub fn get_suggested_directories() -> Vec<String> {
    config::suggest_scan_directories()
}

#[tauri::command]
pub fn get_scan_directories(state: tauri::State<'_, AppState>) -> Vec<String> {
    let cfg = config::load_config(&state.stash_dir);
    cfg.scan_directories
}
