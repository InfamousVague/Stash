use crate::state::{AppState, EnvVar, HistoryEntry, Project};
use crate::team;
use crate::env_parser;
use crate::profile_manager;
use std::collections::HashSet;
use std::path::Path;

/// If auto-push is enabled in lock metadata, silently push to .stash.lock after a var change.
fn maybe_auto_push(state: &AppState, project_id: &str) {
    let project_path = match state.get_project_path(project_id) {
        Ok(p) => p,
        Err(_) => return,
    };
    let lock_path = Path::new(&project_path).join(".stash.lock");
    if !lock_path.exists() {
        return;
    }
    let lock = match team::read_lock_file(&project_path) {
        Ok(l) => l,
        Err(_) => return,
    };
    let enabled = lock.metadata
        .get("auto_push_on_change")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        return;
    }
    // Fire push_lock logic inline (best-effort, don't fail the var operation)
    if let Ok((_, my_public)) = team::load_keypair(&state.stash_dir) {
        if lock.members.iter().any(|m| m.public_key == my_public) {
            // Re-invoke push via the command module — import would be circular,
            // so we call the team module directly
            let _ = crate::commands::team::push_lock_inner(state, project_id);
        }
    }
}

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
        local_only: false,
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
    maybe_auto_push(&state, &project_id);
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
    maybe_auto_push(&state, &project_id);
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
    maybe_auto_push(&state, &project_id);
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
    let mut result: std::collections::HashMap<String, u64> = std::collections::HashMap::new();

    // Local rotation data
    if let Ok(rotation) = state.rotation.lock() {
        let prefix = format!("{}:", project_id);
        for (k, &v) in rotation.iter() {
            if let Some(key) = k.strip_prefix(&prefix) {
                result.insert(key.to_string(), v);
            }
        }
    }

    // Merge rotation from .stash.lock metadata (team-shared timestamps)
    if let Ok(project_path) = state.get_project_path(&project_id) {
        let lock_path = std::path::Path::new(&project_path).join(".stash.lock");
        if lock_path.exists() {
            if let Ok(lock) = crate::team::read_lock_file(&project_path) {
                if let Some(rotation_value) = lock.metadata.get("rotation") {
                    if let Ok(lock_rotation) = serde_json::from_value::<std::collections::HashMap<String, u64>>(rotation_value.clone()) {
                        for (lock_key, lock_ts) in lock_rotation {
                            // lock_key is "profile:KEY" — extract just the KEY
                            let env_key = lock_key.splitn(2, ':').nth(1).unwrap_or(&lock_key);
                            let local_ts = result.get(env_key).copied().unwrap_or(0);
                            if lock_ts > local_ts {
                                result.insert(env_key.to_string(), lock_ts);
                            }
                        }
                    }
                }
            }
        }
    }

    result
}

#[tauri::command]
pub fn get_project_profile_vars(
    state: tauri::State<'_, AppState>,
    project_id: String,
    profile_name: String,
) -> Result<Vec<EnvVar>, String> {
    let project_path = state.get_project_path(&project_id)?;

    let env_path = crate::helpers::profile_env_path(&project_path, &profile_name);

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

#[tauri::command]
pub fn generate_env_example(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<String, String> {
    let project_path = state.get_project_path(&project_id)?;
    let env_path = Path::new(&project_path).join(".env");

    let vars = if env_path.exists() {
        env_parser::read_env_file(&env_path.to_string_lossy())?
    } else {
        // Try active profile
        let profiles = profile_manager::list_profiles(&project_path);
        if let Some(first) = profiles.first() {
            let profile_path = Path::new(&project_path).join(format!(".env.{}", first));
            if profile_path.exists() {
                env_parser::read_env_file(&profile_path.to_string_lossy())?
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    };

    if vars.is_empty() {
        return Err("No variables found to generate .env.example".to_string());
    }

    let example_path = Path::new(&project_path).join(".env.example");
    let example_vars: Vec<EnvVar> = vars.into_iter().map(|v| EnvVar {
        key: v.key,
        value: String::new(),
    }).collect();

    env_parser::write_env_file(&example_path.to_string_lossy(), &example_vars)?;
    Ok(example_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn batch_add_vars(
    state: tauri::State<'_, AppState>,
    project_id: String,
    vars: Vec<EnvVar>,
) -> Result<usize, String> {
    let project_path = state.get_project_path(&project_id)?;
    let env_path = Path::new(&project_path).join(".env");
    let mut count = 0;

    for var in &vars {
        if var.key.is_empty() {
            continue;
        }
        match env_parser::add_var_to_file(&env_path.to_string_lossy(), &var.key, &var.value) {
            Ok(_) => {
                state.record_rotation(&project_id, &var.key);
                state.record_history(&project_id, &var.key, "created", None, Some(&var.value));
                count += 1;
            }
            Err(_) => {
                // Duplicate key — try updating instead
                let _ = env_parser::update_var_in_file(&env_path.to_string_lossy(), &var.key, &var.value);
                state.record_rotation(&project_id, &var.key);
                state.record_history(&project_id, &var.key, "updated", None, Some(&var.value));
                count += 1;
            }
        }
    }

    // Single auto-push at the end
    if count > 0 {
        maybe_auto_push(&state, &project_id);
    }

    Ok(count)
}

/// Find a project icon and return it as a base64 data URL.
#[tauri::command]
pub fn find_project_icon(project_path: String) -> Option<String> {
    let base = Path::new(&project_path);

    let found_path = find_icon_path(base)?;

    // Read file and convert to data URL
    let data = std::fs::read(&found_path).ok()?; // graceful: missing icon is not an error
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

const STASH_GITIGNORE_ENTRIES: &[&str] = &[
    "# Stash local-only mode",
    ".env",
    ".env.*",
    "!.env.example",
    ".stash.lock",
];

#[tauri::command]
pub fn set_local_only(
    state: tauri::State<'_, AppState>,
    project_id: String,
    local_only: bool,
) -> Result<(), String> {
    // Update project state
    let project_path = {
        let mut projects = state.projects.lock()
            .map_err(|_| "Lock poisoned".to_string())?;
        let project = projects.iter_mut()
            .find(|p| p.id == project_id)
            .ok_or("Project not found".to_string())?;
        project.local_only = local_only;
        project.path.clone()
    };
    state.save_projects();

    // Update .gitignore
    let gitignore_path = Path::new(&project_path).join(".gitignore");

    if local_only {
        // Add entries to .gitignore
        let existing = std::fs::read_to_string(&gitignore_path).unwrap_or_default();
        let mut lines: Vec<String> = existing.lines().map(|l| l.to_string()).collect();

        // Check if we already added our block
        if !lines.iter().any(|l| l.contains("Stash local-only mode")) {
            if !lines.is_empty() && !lines.last().map(|l| l.is_empty()).unwrap_or(true) {
                lines.push(String::new());
            }
            for entry in STASH_GITIGNORE_ENTRIES {
                lines.push(entry.to_string());
            }
            let content = lines.join("\n") + "\n";
            std::fs::write(&gitignore_path, content)
                .map_err(|e| format!("Failed to write .gitignore: {}", e))?;
        }
    } else {
        // Remove our entries from .gitignore
        if gitignore_path.exists() {
            let existing = std::fs::read_to_string(&gitignore_path)
                .map_err(|e| format!("Failed to read .gitignore: {}", e))?;
            let stash_entries: HashSet<&str> =
                STASH_GITIGNORE_ENTRIES.iter().copied().collect();
            let lines: Vec<&str> = existing.lines()
                .filter(|l| !stash_entries.contains(l))
                .collect();
            // Trim trailing empty lines left over
            let mut result: Vec<&str> = lines.into_iter().collect();
            while result.last() == Some(&"") {
                result.pop();
            }
            let content = if result.is_empty() {
                String::new()
            } else {
                result.join("\n") + "\n"
            };
            std::fs::write(&gitignore_path, content)
                .map_err(|e| format!("Failed to write .gitignore: {}", e))?;
        }
    }

    Ok(())
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
