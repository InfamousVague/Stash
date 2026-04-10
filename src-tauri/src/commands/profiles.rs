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
    let project_path = state.get_project_path(&project_id)?;
    Ok(profile_manager::list_profiles(&project_path))
}

#[tauri::command]
pub fn get_active_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<String, String> {
    let project_path = state.get_project_path(&project_id)?;
    Ok(profile_manager::get_active_profile(&project_path))
}

#[tauri::command]
pub fn switch_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
    profile_name: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    profile_manager::switch_profile(&project_path, &profile_name)
}

#[tauri::command]
pub fn create_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
    copy_from: Option<String>,
    copy_values: Option<bool>,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    profile_manager::create_profile(&project_path, &name, copy_from.as_deref(), copy_values.unwrap_or(false))
}

#[tauri::command]
pub fn delete_profile(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    profile_manager::delete_profile(&project_path, &name)
}

fn load_profile_vars(project_path: &str, profile: &str) -> Result<HashMap<String, String>, String> {
    let profile_path = Path::new(project_path).join(format!(".env.{}", profile));
    if profile_path.exists() {
        return Ok(env_parser::read_env_file(&profile_path.to_string_lossy())?
            .into_iter().map(|v| (v.key, v.value)).collect());
    }
    if profile == "default" {
        let default_path = Path::new(project_path).join(".env");
        if default_path.exists() {
            return Ok(env_parser::read_env_file(&default_path.to_string_lossy())?
                .into_iter().map(|v| (v.key, v.value)).collect());
        }
    }
    Ok(HashMap::new())
}

#[derive(serde::Serialize)]
pub struct DiffEntry {
    pub key: String,
    pub left_value: Option<String>,
    pub right_value: Option<String>,
    pub status: String,
}

#[tauri::command]
pub fn diff_profiles(
    state: tauri::State<'_, AppState>,
    project_id: String,
    left_profile: String,
    right_profile: String,
) -> Result<Vec<DiffEntry>, String> {
    let project_path = state.get_project_path(&project_id)?;

    let left_vars = load_profile_vars(&project_path, &left_profile)?;
    let right_vars = load_profile_vars(&project_path, &right_profile)?;

    let mut all_keys: Vec<String> = left_vars.keys().chain(right_vars.keys())
        .cloned().collect::<std::collections::HashSet<_>>()
        .into_iter().collect();
    all_keys.sort();

    let entries = all_keys.into_iter().map(|key| {
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
