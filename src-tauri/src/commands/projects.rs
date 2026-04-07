use crate::state::{AppState, EnvVar, Project};
use crate::env_parser;
use crate::profile_manager;
use std::path::Path;

#[tauri::command]
pub fn import_project(
    state: tauri::State<'_, AppState>,
    project_path: String,
    project_name: String,
) -> Result<Project, String> {
    let path = Path::new(&project_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", project_path));
    }

    // Check if already imported
    {
        let projects = state.projects.lock().unwrap();
        if projects.iter().any(|p| p.path == project_path) {
            return Err("Project already imported".to_string());
        }
    }

    // Detect framework
    let framework = detect_framework_for_project(path);

    // Get profiles and active profile
    let profiles = profile_manager::list_profiles(&project_path);
    let active_profile = profile_manager::get_active_profile(&project_path);

    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: project_name,
        path: project_path,
        framework,
        active_profile,
        profiles,
    };

    {
        let mut projects = state.projects.lock().unwrap();
        projects.push(project.clone());
    }

    state.save_projects();

    Ok(project)
}

#[tauri::command]
pub fn list_projects(state: tauri::State<'_, AppState>) -> Vec<Project> {
    let projects = state.projects.lock().unwrap();
    projects.clone()
}

#[tauri::command]
pub fn get_project_vars(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<EnvVar>, String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let env_path = Path::new(&project.path).join(".env");
    if !env_path.exists() {
        return Ok(Vec::new());
    }

    env_parser::read_env_file(&env_path.to_string_lossy())
}

#[tauri::command]
pub fn update_var(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let env_path = Path::new(&project.path).join(".env");
    env_parser::update_var_in_file(&env_path.to_string_lossy(), &key, &value)?;
    drop(projects);
    state.record_rotation(&project_id, &key);
    Ok(())
}

#[tauri::command]
pub fn add_var(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let env_path = Path::new(&project.path).join(".env");
    env_parser::add_var_to_file(&env_path.to_string_lossy(), &key, &value)?;
    drop(projects);
    state.record_rotation(&project_id, &key);
    Ok(())
}

#[tauri::command]
pub fn delete_var(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let env_path = Path::new(&project.path).join(".env");
    env_parser::remove_var_from_file(&env_path.to_string_lossy(), &key)
}

#[tauri::command]
pub fn delete_project(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    {
        let mut projects = state.projects.lock().unwrap();
        let original_len = projects.len();
        projects.retain(|p| p.id != project_id);
        if projects.len() == original_len {
            return Err("Project not found".to_string());
        }
    }

    state.save_projects();
    Ok(())
}

#[tauri::command]
pub fn get_rotation_info(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> std::collections::HashMap<String, u64> {
    let rotation = state.rotation.lock().unwrap();
    let prefix = format!("{}:", project_id);
    rotation.iter()
        .filter(|(k, _)| k.starts_with(&prefix))
        .map(|(k, v)| (k[prefix.len()..].to_string(), *v))
        .collect()
}

fn detect_framework_for_project(path: &Path) -> Option<String> {
    if path.join("package.json").exists() {
        if let Ok(content) = std::fs::read_to_string(path.join("package.json")) {
            if content.contains("\"next\"") {
                return Some("next".to_string());
            }
            if content.contains("\"@angular/core\"") {
                return Some("angular".to_string());
            }
            if content.contains("\"vue\"") {
                return Some("vue".to_string());
            }
            if content.contains("\"express\"") {
                return Some("express".to_string());
            }
            if content.contains("\"react\"") {
                return Some("react".to_string());
            }
        }
    }
    if path.join("Gemfile").exists() {
        return Some("rails".to_string());
    }
    if path.join("requirements.txt").exists() || path.join("pyproject.toml").exists() {
        return Some("python".to_string());
    }
    if path.join("composer.json").exists() {
        return Some("laravel".to_string());
    }
    if path.join("Cargo.toml").exists() {
        return Some("rust".to_string());
    }
    if path.join("go.mod").exists() {
        return Some("go".to_string());
    }
    None
}
