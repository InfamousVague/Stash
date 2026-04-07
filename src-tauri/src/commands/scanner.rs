use std::sync::atomic::Ordering;
use crate::state::{AppState, EnvFileGroup};

#[tauri::command]
pub fn start_scan(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if state.scan_running.load(Ordering::SeqCst) {
        return Err("Scan already running".to_string());
    }

    let running = Arc::clone(&state.scan_running);
    let results = Arc::clone(&state.scan_results);

    crate::scanner::start_scan(app, running, results);

    Ok(())
}

#[tauri::command]
pub fn get_scan_results(state: tauri::State<'_, AppState>) -> Vec<EnvFileGroup> {
    let results = state.scan_results.lock().unwrap();
    results.clone()
}

#[tauri::command]
pub fn cancel_scan(state: tauri::State<'_, AppState>) {
    state.scan_running.store(false, Ordering::SeqCst);
}

use std::sync::Arc;
