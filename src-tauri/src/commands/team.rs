use crate::state::AppState;
use crate::team::{self, TeamMember, LockFile};
use crate::env_parser;
use std::path::Path;
use std::collections::HashMap;

#[tauri::command]
pub fn generate_team_key(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let (private_b64, public_b64) = team::generate_keypair();

    let key_path = format!("{}/keypair.json", state.stash_dir);
    let keypair = serde_json::json!({
        "private": private_b64,
        "public": public_b64,
    });
    let json = serde_json::to_string_pretty(&keypair).map_err(|e| e.to_string())?;
    std::fs::write(&key_path, json)
        .map_err(|e| format!("Failed to save keypair: {}", e))?;

    // Set restrictive permissions on keypair file
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600)).ok();
    }

    let pub_path = format!("{}/public_key.txt", state.stash_dir);
    std::fs::write(&pub_path, &public_b64).ok();

    log::info!("Generated team keypair");
    Ok(public_b64)
}

#[tauri::command]
pub fn get_public_key(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let (_, public) = team::load_keypair(&state.stash_dir)?;
    Ok(public)
}

#[tauri::command]
pub fn push_lock(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    let active_profile = {
        let projects = state.projects.lock().map_err(|_| "Lock poisoned".to_string())?;
        projects.iter().find(|p| p.id == project_id)
            .map(|p| p.active_profile.clone())
            .unwrap_or_else(|| "default".to_string())
    };

    let env_path = Path::new(&project_path).join(".env");
    let vars = if env_path.exists() {
        env_parser::read_env_file(&env_path.to_string_lossy())?
    } else {
        Vec::new()
    };

    let mut lock = team::read_lock_file(&project_path).unwrap_or(LockFile {
        version: 1,
        members: Vec::new(),
        variables: HashMap::new(),
        profile: active_profile.clone(),
    });

    let (_, my_public) = team::load_keypair(&state.stash_dir)?;
    if !lock.members.iter().any(|m| m.public_key == my_public) {
        lock.members.push(TeamMember {
            name: "Me".to_string(),
            public_key: my_public,
        });
    }

    lock.variables.clear();
    for var in &vars {
        let mut encrypted_map = HashMap::new();
        for member in &lock.members {
            let encrypted = team::encrypt_for_recipient(&var.value, &member.public_key)?;
            encrypted_map.insert(member.name.clone(), encrypted);
        }
        lock.variables.insert(var.key.clone(), encrypted_map);
    }

    lock.profile = active_profile;
    team::write_lock_file(&project_path, &lock)?;
    log::info!("Pushed {} vars to .stash.lock for {} members", vars.len(), lock.members.len());
    Ok(())
}

#[tauri::command]
pub fn pull_lock(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<crate::state::EnvVar>, String> {
    let project_path = state.get_project_path(&project_id)?;

    let lock = team::read_lock_file(&project_path)?;
    let (private_key, my_public) = team::load_keypair(&state.stash_dir)?;

    let my_name = lock.members.iter()
        .find(|m| m.public_key == my_public)
        .map(|m| m.name.clone())
        .ok_or("You are not a member of this lock file")?;

    let mut vars = Vec::new();
    for (key, encrypted_map) in &lock.variables {
        if let Some(encrypted) = encrypted_map.get(&my_name) {
            match team::decrypt_with_private_key(encrypted, &private_key) {
                Ok(value) => vars.push(crate::state::EnvVar { key: key.clone(), value }),
                Err(e) => log::warn!("Failed to decrypt {}: {}", key, e),
            }
        }
    }

    let env_path = Path::new(&project_path).join(".env");
    let content = vars.iter()
        .map(|v| format!("{}={}", v.key, v.value))
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&env_path, content)
        .map_err(|e| format!("Failed to write .env: {}", e))?;

    log::info!("Pulled {} vars from .stash.lock", vars.len());
    Ok(vars)
}

#[tauri::command]
pub fn add_team_member(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
    public_key: String,
) -> Result<(), String> {
    // Validate inputs
    if name.is_empty() || name.len() > 100 {
        return Err("Name must be 1-100 characters".to_string());
    }
    // Validate public key is valid 32-byte base64
    let key_bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &public_key)
        .map_err(|_| "Invalid public key format".to_string())?;
    if key_bytes.len() != 32 {
        return Err("Public key must be 32 bytes".to_string());
    }

    let project_path = state.get_project_path(&project_id)?;
    let active_profile = {
        let projects = state.projects.lock().map_err(|_| "Lock poisoned".to_string())?;
        projects.iter().find(|p| p.id == project_id)
            .map(|p| p.active_profile.clone())
            .unwrap_or_else(|| "default".to_string())
    };

    let mut lock = team::read_lock_file(&project_path).unwrap_or(LockFile {
        version: 1,
        members: Vec::new(),
        variables: HashMap::new(),
        profile: active_profile,
    });

    if lock.members.iter().any(|m| m.name == name) {
        return Err(format!("Member '{}' already exists", name));
    }

    lock.members.push(TeamMember { name, public_key });
    team::write_lock_file(&project_path, &lock)?;
    Ok(())
}

#[tauri::command]
pub fn remove_team_member(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;

    let mut lock = team::read_lock_file(&project_path)?;
    lock.members.retain(|m| m.name != name);
    for encrypted_map in lock.variables.values_mut() {
        encrypted_map.remove(&name);
    }
    team::write_lock_file(&project_path, &lock)?;
    Ok(())
}

#[tauri::command]
pub fn list_team_members(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<TeamMember>, String> {
    let project_path = state.get_project_path(&project_id)?;

    match team::read_lock_file(&project_path) {
        Ok(lock) => Ok(lock.members),
        Err(_) => Ok(Vec::new()),
    }
}

use base64;
