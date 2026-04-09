use crate::state::{AppState, EnvVar, HistoryEntry, Project};
use crate::env_parser;
use crate::profile_manager;
use std::path::Path;

#[tauri::command]
pub fn import_project(
    state: tauri::State<'_, AppState>,
    project_path: String,
    project_name: String,
) -> Result<Project, String> {
    // Validate inputs
    if project_name.is_empty() {
        return Err("Project name cannot be empty".to_string());
    }
    if project_name.len() > 200 {
        return Err("Project name must be under 200 characters".to_string());
    }
    if project_path.contains("..") {
        return Err("Project path must not contain '..'".to_string());
    }

    let path = Path::new(&project_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", project_path));
    }

    // Check if already imported
    {
        let projects = state.projects.lock()
            .map_err(|_| "Lock poisoned".to_string())?;
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
        let mut projects = state.projects.lock()
            .map_err(|_| "Lock poisoned".to_string())?;
        projects.push(project.clone());
    }

    state.save_projects();

    Ok(project)
}

#[tauri::command]
pub fn list_projects(state: tauri::State<'_, AppState>) -> Vec<Project> {
    state.projects.lock().map(|p| p.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn get_project_vars(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<EnvVar>, String> {
    let project_path = state.get_project_path(&project_id)?;

    let env_path = Path::new(&project_path).join(".env");
    if env_path.exists() {
        return env_parser::read_env_file(&env_path.to_string_lossy());
    }

    // If no .env, try the active profile or first available .env.* file
    let profiles = profile_manager::list_profiles(&project_path);
    if let Some(first_profile) = profiles.first() {
        let profile_path = Path::new(&project_path).join(format!(".env.{}", first_profile));
        if profile_path.exists() {
            return env_parser::read_env_file(&profile_path.to_string_lossy());
        }
    }

    Ok(Vec::new())
}

#[tauri::command]
pub fn update_var(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    let env_path = Path::new(&project_path).join(".env");

    // Read old value for history
    let old_value = env_parser::read_env_file(&env_path.to_string_lossy())
        .ok()
        .and_then(|vars| vars.into_iter().find(|v| v.key == key).map(|v| v.value));

    env_parser::update_var_in_file(&env_path.to_string_lossy(), &key, &value)?;
    state.record_rotation(&project_id, &key);
    state.record_history(&project_id, &key, "updated", old_value.as_deref(), Some(&value));
    Ok(())
}

#[tauri::command]
pub fn add_var(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;

    let env_path = Path::new(&project_path).join(".env");
    env_parser::add_var_to_file(&env_path.to_string_lossy(), &key, &value)?;
    state.record_rotation(&project_id, &key);
    state.record_history(&project_id, &key, "created", None, Some(&value));
    Ok(())
}

#[tauri::command]
pub fn delete_var(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    let env_path = Path::new(&project_path).join(".env");

    // Read old value for history
    let old_value = env_parser::read_env_file(&env_path.to_string_lossy())
        .ok()
        .and_then(|vars| vars.into_iter().find(|v| v.key == key).map(|v| v.value));

    env_parser::remove_var_from_file(&env_path.to_string_lossy(), &key)?;
    state.record_history(&project_id, &key, "deleted", old_value.as_deref(), None);
    Ok(())
}

#[tauri::command]
pub fn delete_project(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    {
        let mut projects = state.projects.lock()
            .map_err(|_| "Lock poisoned".to_string())?;
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
    let rotation = match state.rotation.lock() {
        Ok(r) => r,
        Err(_) => return std::collections::HashMap::new(),
    };
    let prefix = format!("{}:", project_id);
    rotation.iter()
        .filter(|(k, _)| k.starts_with(&prefix))
        .map(|(k, v)| (k[prefix.len()..].to_string(), *v))
        .collect()
}

#[tauri::command]
pub fn get_project_profile_vars(
    state: tauri::State<'_, AppState>,
    project_id: String,
    profile_name: String,
) -> Result<Vec<EnvVar>, String> {
    let project_path = state.get_project_path(&project_id)?;

    let env_path = if profile_name == "default" {
        Path::new(&project_path).join(".env")
    } else {
        Path::new(&project_path).join(format!(".env.{}", profile_name))
    };

    if !env_path.exists() {
        return Ok(Vec::new());
    }

    env_parser::read_env_file(&env_path.to_string_lossy())
}

#[tauri::command]
pub fn generate_env_file(
    path: String,
    vars: Vec<EnvVar>,
) -> Result<(), String> {
    let dest = Path::new(&path);

    // Create parent directories if needed
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    env_parser::write_env_file(&path, &vars)
}

#[tauri::command]
pub fn get_var_history(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
) -> Vec<HistoryEntry> {
    state.get_history(&project_id, &key)
}

/// Find a project icon and return it as a base64 data URL.
#[tauri::command]
pub fn find_project_icon(project_path: String) -> Option<String> {
    let base = Path::new(&project_path);

    let found_path = find_icon_path(base)?;

    // Read file and convert to data URL
    let data = std::fs::read(&found_path).ok()?;
    let ext = found_path.rsplit('.').next().unwrap_or("png").to_lowercase();
    let mime = match ext.as_str() {
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    Some(format!("data:{};base64,{}", mime, b64))
}

fn find_icon_path(base: &Path) -> Option<String> {
    // Phase 1: Check exact known paths — ordered by quality (larger/better icons first)
    let exact_candidates = [
        // Native app icons (highest quality)
        "src-tauri/icons/128x128.png", "src-tauri/icons/icon.png",
        // Larger web icons
        "public/logo.png", "public/logo192.png", "public/icon.png",
        "src/assets/logo.png", "src/assets/icon.png",
        "assets/icon.png", "assets/logo.png",
        // Electron / build
        "build/icon.png", "resources/icon.png",
        // Android
        "android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
        // Favicons (smallest, last resort)
        "public/favicon.png", "public/favicon.svg", "public/favicon.ico",
        "static/favicon.png", "static/favicon.ico",
        "dist/favicon.png", "dist/favicon.svg", "dist/favicon.ico",
        // Generic
        "icon.png", "logo.png",
    ];

    for candidate in &exact_candidates {
        let icon_path = base.join(candidate);
        if icon_path.exists() {
            return Some(icon_path.to_string_lossy().to_string());
        }
    }

    // Phase 2: Search common directories for icon/logo/favicon files
    let search_dirs = ["native", "src/assets", "src", "assets", "public", "static", "resources", "dist"];
    let icon_patterns = ["icon", "logo", "favicon", "appicon", "app-icon", "app_icon"];
    let icon_extensions = ["png", "jpg", "jpeg", "svg", "ico", "webp"];

    for dir in &search_dirs {
        let search_path = base.join(dir);
        if !search_path.exists() { continue; }

        for entry in walkdir::WalkDir::new(&search_path)
            .max_depth(4)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() { continue; }
            let path_str = entry.path().to_string_lossy();
            if path_str.contains("node_modules") || path_str.contains("/.") { continue; }

            let name = entry.file_name().to_string_lossy().to_lowercase();
            let matches_pattern = icon_patterns.iter().any(|p| name.contains(p));
            let matches_ext = icon_extensions.iter().any(|e| name.ends_with(&format!(".{}", e)));
            if matches_pattern && matches_ext {
                return Some(entry.path().to_string_lossy().to_string());
            }
        }
    }

    None
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
