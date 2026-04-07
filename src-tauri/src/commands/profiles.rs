use crate::state::AppState;
use crate::profile_manager;
use crate::env_parser;
use std::collections::HashMap;
use std::path::Path;

#[tauri::command]
pub fn list_profiles(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<String>, String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    Ok(profile_manager::list_profiles(&project.path))
}

#[tauri::command]
pub fn get_active_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<String, String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    Ok(profile_manager::get_active_profile(&project.path))
}

#[tauri::command]
pub fn switch_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
    profile_name: String,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    profile_manager::switch_profile(&project.path, &profile_name)
}

#[tauri::command]
pub fn create_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
    copy_from: Option<String>,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    profile_manager::create_profile(&project.path, &name, copy_from.as_deref())
}

#[tauri::command]
pub fn delete_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    profile_manager::delete_profile(&project.path, &name)
}

#[derive(serde::Serialize)]
pub struct DiffEntry {
    pub key: String,
    pub left_value: Option<String>,
    pub right_value: Option<String>,
    pub status: String, // "same", "changed", "added", "removed"
}

#[tauri::command]
pub fn diff_profiles(
    state: tauri::State<'_, AppState>,
    project_id: String,
    left_profile: String,
    right_profile: String,
) -> Result<Vec<DiffEntry>, String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let left_path = Path::new(&project.path).join(format!(".env.{}", left_profile));
    let right_path = Path::new(&project.path).join(format!(".env.{}", right_profile));

    let left_vars: HashMap<String, String> = if left_path.exists() {
        env_parser::read_env_file(&left_path.to_string_lossy())?
            .into_iter().map(|v| (v.key, v.value)).collect()
    } else if left_profile == "default" {
        let default_path = Path::new(&project.path).join(".env");
        if default_path.exists() {
            env_parser::read_env_file(&default_path.to_string_lossy())?
                .into_iter().map(|v| (v.key, v.value)).collect()
        } else {
            HashMap::new()
        }
    } else {
        HashMap::new()
    };

    let right_vars: HashMap<String, String> = if right_path.exists() {
        env_parser::read_env_file(&right_path.to_string_lossy())?
            .into_iter().map(|v| (v.key, v.value)).collect()
    } else if right_profile == "default" {
        let default_path = Path::new(&project.path).join(".env");
        if default_path.exists() {
            env_parser::read_env_file(&default_path.to_string_lossy())?
                .into_iter().map(|v| (v.key, v.value)).collect()
        } else {
            HashMap::new()
        }
    } else {
        HashMap::new()
    };

    let mut all_keys: Vec<String> = left_vars.keys().chain(right_vars.keys())
        .cloned().collect::<std::collections::HashSet<_>>()
        .into_iter().collect();
    all_keys.sort();

    let entries: Vec<DiffEntry> = all_keys.into_iter().map(|key| {
        let left = left_vars.get(&key);
        let right = right_vars.get(&key);
        let status = match (left, right) {
            (Some(l), Some(r)) if l == r => "same",
            (Some(_), Some(_)) => "changed",
            (Some(_), None) => "removed",
            (None, Some(_)) => "added",
            (None, None) => "same",
        };
        DiffEntry {
            key,
            left_value: left.cloned(),
            right_value: right.cloned(),
            status: status.to_string(),
        }
    }).collect();

    Ok(entries)
}
