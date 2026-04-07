use crate::state::AppState;
use crate::team::{self, TeamMember, LockFile};
use crate::env_parser;
use std::path::Path;
use std::collections::HashMap;

#[tauri::command]
pub fn generate_team_key(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let (private_b64, public_b64) = team::generate_keypair();

    // Store keypair in ~/.stash/
    let key_path = format!("{}/keypair.json", state.stash_dir);
    let keypair = serde_json::json!({
        "private": private_b64,
        "public": public_b64,
    });
    std::fs::write(&key_path, serde_json::to_string_pretty(&keypair).unwrap())
        .map_err(|e| format!("Failed to save keypair: {}", e))?;

    // Also save public key as plain text for easy sharing
    let pub_path = format!("{}/public_key.txt", state.stash_dir);
    std::fs::write(&pub_path, &public_b64).ok();

    log::info!("Generated team keypair");
    Ok(public_b64)
}

#[tauri::command]
pub fn get_public_key(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let key_path = format!("{}/keypair.json", state.stash_dir);
    if !Path::new(&key_path).exists() {
        return Err("No keypair generated yet".to_string());
    }
    let content = std::fs::read_to_string(&key_path)
        .map_err(|e| format!("Failed to read keypair: {}", e))?;
    let keypair: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid keypair: {}", e))?;
    keypair["public"].as_str()
        .map(|s| s.to_string())
        .ok_or("Missing public key".to_string())
}

fn get_private_key(stash_dir: &str) -> Result<String, String> {
    let key_path = format!("{}/keypair.json", stash_dir);
    let content = std::fs::read_to_string(&key_path)
        .map_err(|e| format!("Failed to read keypair: {}", e))?;
    let keypair: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid keypair: {}", e))?;
    keypair["private"].as_str()
        .map(|s| s.to_string())
        .ok_or("Missing private key".to_string())
}

#[tauri::command]
pub fn push_lock(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    // Read current .env vars
    let env_path = Path::new(&project.path).join(".env");
    let vars = if env_path.exists() {
        env_parser::read_env_file(&env_path.to_string_lossy())?
    } else {
        Vec::new()
    };

    // Read existing lock file or create new one
    let mut lock = team::read_lock_file(&project.path).unwrap_or(LockFile {
        version: 1,
        members: Vec::new(),
        variables: HashMap::new(),
        profile: project.active_profile.clone(),
    });

    // Get our public key and ensure we're a member
    let my_public = get_public_key_from_state(&state)?;
    if !lock.members.iter().any(|m| m.public_key == my_public) {
        lock.members.push(TeamMember {
            name: "Me".to_string(),
            public_key: my_public,
        });
    }

    // Encrypt each var for each member
    lock.variables.clear();
    for var in &vars {
        let mut encrypted_map = HashMap::new();
        for member in &lock.members {
            let encrypted = team::encrypt_for_recipient(&var.value, &member.public_key)?;
            encrypted_map.insert(member.name.clone(), encrypted);
        }
        lock.variables.insert(var.key.clone(), encrypted_map);
    }

    lock.profile = project.active_profile.clone();

    team::write_lock_file(&project.path, &lock)?;
    log::info!("Pushed {} vars to .stash.lock for {} members", vars.len(), lock.members.len());
    Ok(())
}

#[tauri::command]
pub fn pull_lock(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<crate::state::EnvVar>, String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let lock = team::read_lock_file(&project.path)?;
    let private_key = get_private_key(&state.stash_dir)?;
    let my_public = get_public_key_from_state(&state)?;

    // Find my name in the members list
    let my_name = lock.members.iter()
        .find(|m| m.public_key == my_public)
        .map(|m| m.name.clone())
        .ok_or("You are not a member of this lock file")?;

    // Decrypt each var
    let mut vars = Vec::new();
    for (key, encrypted_map) in &lock.variables {
        if let Some(encrypted) = encrypted_map.get(&my_name) {
            match team::decrypt_with_private_key(encrypted, &private_key) {
                Ok(value) => vars.push(crate::state::EnvVar { key: key.clone(), value }),
                Err(e) => log::warn!("Failed to decrypt {}: {}", key, e),
            }
        }
    }

    // Write to .env
    let env_path = Path::new(&project.path).join(".env");
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
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let mut lock = team::read_lock_file(&project.path).unwrap_or(LockFile {
        version: 1,
        members: Vec::new(),
        variables: HashMap::new(),
        profile: project.active_profile.clone(),
    });

    if lock.members.iter().any(|m| m.name == name) {
        return Err(format!("Member '{}' already exists", name));
    }

    lock.members.push(TeamMember { name, public_key });
    team::write_lock_file(&project.path, &lock)?;
    Ok(())
}

#[tauri::command]
pub fn remove_team_member(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
) -> Result<(), String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let mut lock = team::read_lock_file(&project.path)?;
    lock.members.retain(|m| m.name != name);
    for encrypted_map in lock.variables.values_mut() {
        encrypted_map.remove(&name);
    }
    team::write_lock_file(&project.path, &lock)?;
    Ok(())
}

#[tauri::command]
pub fn list_team_members(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<TeamMember>, String> {
    let projects = state.projects.lock().unwrap();
    let project = projects.iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    match team::read_lock_file(&project.path) {
        Ok(lock) => Ok(lock.members),
        Err(_) => Ok(Vec::new()),
    }
}

fn get_public_key_from_state(state: &tauri::State<'_, AppState>) -> Result<String, String> {
    let key_path = format!("{}/keypair.json", state.stash_dir);
    if !Path::new(&key_path).exists() {
        // Auto-generate
        let (private_b64, public_b64) = team::generate_keypair();
        let keypair = serde_json::json!({ "private": private_b64, "public": public_b64 });
        std::fs::write(&key_path, serde_json::to_string_pretty(&keypair).unwrap())
            .map_err(|e| format!("Failed to save keypair: {}", e))?;
        return Ok(public_b64);
    }
    let content = std::fs::read_to_string(&key_path)
        .map_err(|e| format!("Failed to read keypair: {}", e))?;
    let keypair: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid keypair: {}", e))?;
    keypair["public"].as_str()
        .map(|s| s.to_string())
        .ok_or("Missing public key".to_string())
}
