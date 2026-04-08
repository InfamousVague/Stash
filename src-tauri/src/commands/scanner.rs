use std::sync::Arc;
use std::sync::atomic::Ordering;
use crate::state::{AppState, EnvFileGroup};

#[tauri::command]
pub fn start_scan(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if state.scan_running.load(Ordering::SeqCst) {
        return Err("Scan already running".to_string());
    }

    let running = Arc::clone(&state.scan_running);
    let results = Arc::clone(&state.scan_results);

    let scan_dirs = crate::config::load_config(&state.stash_dir).scan_directories;
    crate::scanner::start_scan(app, running, results, scan_dirs);

    Ok(())
}

#[tauri::command]
pub fn get_scan_results(state: tauri::State<'_, AppState>) -> Vec<EnvFileGroup> {
    state.scan_results.lock().map(|r| r.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn cancel_scan(state: tauri::State<'_, AppState>) {
    state.scan_running.store(false, Ordering::SeqCst);
}
