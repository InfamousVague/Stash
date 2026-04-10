use crate::state::AppState;
use crate::team::{self, TeamMember, LockFile};
use crate::env_parser;
use std::path::Path;
use std::collections::HashMap;

/// Resolve the current user's display name for lock file membership.
/// Priority: git config user.name → $USER env var → "Me"
fn resolve_my_name() -> String {
    // Try git config user.name
    if let Ok(output) = std::process::Command::new("git")
        .args(["config", "user.name"])
        .output()
    {
        if output.status.success() {
            let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !name.is_empty() {
                return name;
            }
        }
    }
    // Fallback to $USER
    if let Ok(user) = std::env::var("USER") {
        if !user.is_empty() {
            return user;
        }
    }
    "Me".to_string()
}

#[tauri::command]
pub fn check_lock_initialized(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<bool, String> {
    let project_path = state.get_project_path(&project_id)?;
    Ok(std::path::Path::new(&project_path).join(".stash.lock").exists())
}

#[tauri::command]
pub fn init_lock(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    let lock_path = std::path::Path::new(&project_path).join(".stash.lock");

    if lock_path.exists() {
        return Err(".stash.lock already exists".to_string());
    }

    // Ensure we have a keypair
    let (_, my_public) = match team::load_keypair(&state.stash_dir) {
        Ok(kp) => kp,
        Err(_) => {
            // Auto-generate keypair
            let (private_b64, public_b64) = team::generate_keypair();
            let key_path = format!("{}/keypair.json", state.stash_dir);
            let keypair = serde_json::json!({ "private": private_b64, "public": public_b64 });
            std::fs::write(&key_path, serde_json::to_string_pretty(&keypair).unwrap())
                .map_err(|e| format!("Failed to save keypair: {}", e))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600)).ok();
            }
            let pub_path = format!("{}/public_key.txt", state.stash_dir);
            std::fs::write(&pub_path, &public_b64).ok();
            (private_b64, public_b64)
        }
    };

    use crate::profile_manager;

    let members = vec![TeamMember {
        name: resolve_my_name(),
        public_key: my_public,
    }];

    // Collect all profiles
    let profile_names = profile_manager::list_profiles(&project_path);
    let mut profiles_map: HashMap<String, HashMap<String, HashMap<String, String>>> = HashMap::new();

    for profile_name in &profile_names {
        let profile_path = std::path::Path::new(&project_path).join(format!(".env.{}", profile_name));
        // For "default", fall back to .env if .env.default doesn't exist
        let actual_path = if !profile_path.exists() && profile_name == "default" {
            std::path::Path::new(&project_path).join(".env")
        } else {
            profile_path
        };

        if actual_path.exists() {
            let vars = env_parser::read_env_file(&actual_path.to_string_lossy()).unwrap_or_default();
            let mut profile_vars: HashMap<String, HashMap<String, String>> = HashMap::new();
            for var in &vars {
                let mut encrypted_map = HashMap::new();
                for member in &members {
                    let encrypted = team::encrypt_for_recipient(&var.value, &member.public_key)?;
                    encrypted_map.insert(member.name.clone(), encrypted);
                }
                profile_vars.insert(var.key.clone(), encrypted_map);
            }
            profiles_map.insert(profile_name.clone(), profile_vars);
        }
    }

    // If no profiles found, try the main .env
    if profiles_map.is_empty() {
        let env_path = std::path::Path::new(&project_path).join(".env");
        if env_path.exists() {
            let vars = env_parser::read_env_file(&env_path.to_string_lossy()).unwrap_or_default();
            let mut profile_vars: HashMap<String, HashMap<String, String>> = HashMap::new();
            for var in &vars {
                let mut encrypted_map = HashMap::new();
                for member in &members {
                    let encrypted = team::encrypt_for_recipient(&var.value, &member.public_key)?;
                    encrypted_map.insert(member.name.clone(), encrypted);
                }
                profile_vars.insert(var.key.clone(), encrypted_map);
            }
            profiles_map.insert("default".to_string(), profile_vars);
        }
    }

    let lock = LockFile {
        version: 2,
        members,
        profiles: profiles_map,
        metadata: HashMap::new(),
        variables: HashMap::new(),
        profile: String::new(),
    };

    team::write_lock_file(&project_path, &lock)?;
    let profile_count = lock.profiles.len();
    let var_count: usize = lock.profiles.values().map(|p| p.len()).sum();
    log::info!("Initialized .stash.lock with {} profiles, {} total vars", profile_count, var_count);
    Ok(())
}

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
    use crate::profile_manager;

    let project_path = state.get_project_path(&project_id)?;

    let mut lock = team::read_lock_file(&project_path).unwrap_or(LockFile {
        version: 2,
        members: Vec::new(),
        profiles: HashMap::new(),
        metadata: HashMap::new(),
        variables: HashMap::new(),
        profile: String::new(),
    });

    let (_, my_public) = team::load_keypair(&state.stash_dir)?;
    if !lock.members.iter().any(|m| m.public_key == my_public) {
        lock.members.push(TeamMember {
            name: resolve_my_name(),
            public_key: my_public,
        });
    }

    // Encrypt all profiles
    lock.profiles.clear();
    lock.variables.clear();
    lock.profile = String::new();
    lock.version = 2;

    let profile_names = profile_manager::list_profiles(&project_path);
    for profile_name in &profile_names {
        let profile_path = Path::new(&project_path).join(format!(".env.{}", profile_name));
        let actual_path = if !profile_path.exists() && profile_name == "default" {
            Path::new(&project_path).join(".env")
        } else {
            profile_path
        };

        if actual_path.exists() {
            let vars = env_parser::read_env_file(&actual_path.to_string_lossy()).unwrap_or_default();
            let mut profile_vars: HashMap<String, HashMap<String, String>> = HashMap::new();
            for var in &vars {
                let mut encrypted_map = HashMap::new();
                for member in &lock.members {
                    let encrypted = team::encrypt_for_recipient(&var.value, &member.public_key)?;
                    encrypted_map.insert(member.name.clone(), encrypted);
                }
                profile_vars.insert(var.key.clone(), encrypted_map);
            }
            lock.profiles.insert(profile_name.clone(), profile_vars);
        }
    }

    // If no profiles found, push the main .env
    if lock.profiles.is_empty() {
        let env_path = Path::new(&project_path).join(".env");
        if env_path.exists() {
            let vars = env_parser::read_env_file(&env_path.to_string_lossy()).unwrap_or_default();
            let mut profile_vars: HashMap<String, HashMap<String, String>> = HashMap::new();
            for var in &vars {
                let mut encrypted_map = HashMap::new();
                for member in &lock.members {
                    let encrypted = team::encrypt_for_recipient(&var.value, &member.public_key)?;
                    encrypted_map.insert(member.name.clone(), encrypted);
                }
                profile_vars.insert(var.key.clone(), encrypted_map);
            }
            lock.profiles.insert("default".to_string(), profile_vars);
        }
    }

    team::write_lock_file(&project_path, &lock)?;
    let profile_count = lock.profiles.len();
    let var_count: usize = lock.profiles.values().map(|p| p.len()).sum();
    log::info!("Pushed {} profiles, {} vars to .stash.lock for {} members", profile_count, var_count, lock.members.len());
    Ok(())
}

#[tauri::command]
pub fn pull_lock(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<crate::state::EnvVar>, String> {
    use crate::profile_manager;

    let project_path = state.get_project_path(&project_id)?;
    let lock = team::read_lock_file(&project_path)?;
    let (private_key, my_public) = team::load_keypair(&state.stash_dir)?;

    let my_name = lock.members.iter()
        .find(|m| m.public_key == my_public)
        .map(|m| m.name.clone())
        .ok_or("You are not a member of this lock file")?;

    // Handle v2 (per-profile) format
    if !lock.profiles.is_empty() {
        for (profile_name, profile_vars) in &lock.profiles {
            let mut vars = Vec::new();
            for (key, encrypted_map) in profile_vars {
                if let Some(encrypted) = encrypted_map.get(&my_name) {
                    match team::decrypt_with_private_key(encrypted, &private_key) {
                        Ok(value) => vars.push(crate::state::EnvVar { key: key.clone(), value }),
                        Err(e) => log::warn!("Failed to decrypt {} in profile {}: {}", key, profile_name, e),
                    }
                }
            }

            let content = vars.iter()
                .map(|v| format!("{}={}", v.key, v.value))
                .collect::<Vec<_>>()
                .join("\n");

            let profile_path = if profile_name == "default" {
                Path::new(&project_path).join(".env")
            } else {
                Path::new(&project_path).join(format!(".env.{}", profile_name))
            };
            std::fs::write(&profile_path, &content)
                .map_err(|e| format!("Failed to write {}: {}", profile_path.display(), e))?;
        }

        // Return the active profile's vars for display
        let active = profile_manager::get_active_profile(&project_path);
        let active_vars = lock.profiles.get(&active)
            .or_else(|| lock.profiles.values().next());

        let mut result = Vec::new();
        if let Some(profile_vars) = active_vars {
            for (key, encrypted_map) in profile_vars {
                if let Some(encrypted) = encrypted_map.get(&my_name) {
                    if let Ok(value) = team::decrypt_with_private_key(encrypted, &private_key) {
                        result.push(crate::state::EnvVar { key: key.clone(), value });
                    }
                }
            }
        }
        log::info!("Pulled {} profiles from .stash.lock", lock.profiles.len());
        return Ok(result);
    }

    // Legacy v1 format (flat variables)
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

#[derive(serde::Serialize, Clone, Debug)]
pub struct LockFileInfo {
    pub version: u32,
    pub member_count: usize,
    pub profiles: Vec<LockProfileInfo>,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct LockProfileInfo {
    pub name: String,
    pub key_count: usize,
    pub keys: Vec<String>,
}

#[tauri::command]
pub fn get_lock_info(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<LockFileInfo, String> {
    let project_path = state.get_project_path(&project_id)?;
    let lock = team::read_lock_file(&project_path)?;

    let mut profiles = Vec::new();

    if !lock.profiles.is_empty() {
        for (name, vars) in &lock.profiles {
            let mut keys: Vec<String> = vars.keys().cloned().collect();
            keys.sort();
            profiles.push(LockProfileInfo {
                name: name.clone(),
                key_count: keys.len(),
                keys,
            });
        }
    } else if !lock.variables.is_empty() {
        // Legacy v1
        let mut keys: Vec<String> = lock.variables.keys().cloned().collect();
        keys.sort();
        let name = if lock.profile.is_empty() { "default".to_string() } else { lock.profile.clone() };
        profiles.push(LockProfileInfo {
            name,
            key_count: keys.len(),
            keys,
        });
    }

    profiles.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(LockFileInfo {
        version: lock.version,
        member_count: lock.members.len(),
        profiles,
    })
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct ProfileSyncDetail {
    pub name: String,
    /// "synced" | "changed" | "new" | "lock_only"
    pub status: String,
    pub env_key_count: usize,
    pub lock_key_count: usize,
    pub added_keys: Vec<String>,   // in env but not lock
    pub removed_keys: Vec<String>, // in lock but not env
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct LockSyncStatus {
    pub in_sync: bool,
    pub has_lock: bool,
    pub member_count: usize,
    pub version: u32,
    pub profiles: Vec<ProfileSyncDetail>,
}

#[tauri::command]
pub fn check_lock_sync(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<LockSyncStatus, String> {
    use crate::profile_manager;
    use std::collections::BTreeSet;

    let project_path = state.get_project_path(&project_id)?;
    let lock_path = std::path::Path::new(&project_path).join(".stash.lock");

    if !lock_path.exists() {
        return Ok(LockSyncStatus {
            in_sync: true,
            has_lock: false,
            member_count: 0,
            version: 0,
            profiles: vec![],
        });
    }

    let lock = team::read_lock_file(&project_path)?;
    let profile_names = profile_manager::list_profiles(&project_path);
    let mut details: Vec<ProfileSyncDetail> = Vec::new();
    let mut all_synced = true;

    // Track which lock profiles we've visited
    let mut visited_lock_profiles: BTreeSet<String> = BTreeSet::new();

    for profile_name in &profile_names {
        let profile_path = Path::new(&project_path).join(format!(".env.{}", profile_name));
        let actual_path = if !profile_path.exists() && profile_name == "default" {
            Path::new(&project_path).join(".env")
        } else {
            profile_path
        };

        if !actual_path.exists() {
            continue;
        }

        let env_vars = env_parser::read_env_file(&actual_path.to_string_lossy()).unwrap_or_default();
        let env_keys: BTreeSet<String> = env_vars.iter().map(|v| v.key.clone()).collect();

        let lock_keys: BTreeSet<String> = if let Some(lock_vars) = lock.profiles.get(profile_name) {
            visited_lock_profiles.insert(profile_name.clone());
            lock_vars.keys().cloned().collect()
        } else if lock.profiles.is_empty() && !lock.variables.is_empty() && profile_name == "default" {
            visited_lock_profiles.insert(profile_name.clone());
            lock.variables.keys().cloned().collect()
        } else {
            BTreeSet::new()
        };

        let added: Vec<String> = env_keys.difference(&lock_keys).cloned().collect();
        let removed: Vec<String> = lock_keys.difference(&env_keys).cloned().collect();

        let status = if lock_keys.is_empty() && !env_keys.is_empty() {
            all_synced = false;
            "new".to_string()
        } else if added.is_empty() && removed.is_empty() {
            "synced".to_string()
        } else {
            all_synced = false;
            "changed".to_string()
        };

        details.push(ProfileSyncDetail {
            name: profile_name.clone(),
            status,
            env_key_count: env_keys.len(),
            lock_key_count: lock_keys.len(),
            added_keys: added,
            removed_keys: removed,
        });
    }

    // Profiles in lock but not on disk
    for (lock_profile_name, lock_vars) in &lock.profiles {
        if !visited_lock_profiles.contains(lock_profile_name) {
            all_synced = false;
            let lock_keys: Vec<String> = lock_vars.keys().cloned().collect();
            details.push(ProfileSyncDetail {
                name: lock_profile_name.clone(),
                status: "lock_only".to_string(),
                env_key_count: 0,
                lock_key_count: lock_keys.len(),
                added_keys: vec![],
                removed_keys: lock_keys,
            });
        }
    }

    details.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(LockSyncStatus {
        in_sync: all_synced,
        has_lock: true,
        member_count: lock.members.len(),
        version: lock.version,
        profiles: details,
    })
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

    let mut lock = team::read_lock_file(&project_path).unwrap_or(LockFile {
        version: 2,
        members: Vec::new(),
        profiles: HashMap::new(),
        metadata: HashMap::new(),
        variables: HashMap::new(),
        profile: String::new(),
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
    // Remove from v2 per-profile data
    for profile_vars in lock.profiles.values_mut() {
        for encrypted_map in profile_vars.values_mut() {
            encrypted_map.remove(&name);
        }
    }
    // Remove from legacy v1 data
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

#[derive(serde::Serialize, Clone, Debug)]
pub struct ProjectRef {
    pub id: String,
    pub name: String,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct DeveloperInfo {
    pub name: String,
    pub public_key: String,
    pub projects: Vec<ProjectRef>,
}

#[tauri::command]
pub fn list_all_team_members(state: tauri::State<'_, AppState>) -> Vec<DeveloperInfo> {
    let projects = state.projects.lock().map(|p| p.clone()).unwrap_or_default();

    // Aggregate members by public key across all projects
    let mut dev_map: HashMap<String, DeveloperInfo> = HashMap::new();

    for project in &projects {
        let lock = match team::read_lock_file(&project.path) {
            Ok(l) => l,
            Err(_) => continue,
        };

        for member in &lock.members {
            let entry = dev_map.entry(member.public_key.clone()).or_insert_with(|| DeveloperInfo {
                name: member.name.clone(),
                public_key: member.public_key.clone(),
                projects: Vec::new(),
            });
            entry.projects.push(ProjectRef {
                id: project.id.clone(),
                name: project.name.clone(),
            });
        }
    }

    let mut developers: Vec<DeveloperInfo> = dev_map.into_values().collect();
    developers.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    developers
}

// ── Lock file metadata ────────────────────────────────────

#[tauri::command]
pub fn get_lock_metadata(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    let project_path = state.get_project_path(&project_id)?;
    let lock_path = std::path::Path::new(&project_path).join(".stash.lock");
    if !lock_path.exists() {
        return Ok(HashMap::new());
    }
    let lock = team::read_lock_file(&project_path)?;
    Ok(lock.metadata)
}

#[tauri::command]
pub fn set_lock_metadata(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    let lock_path = std::path::Path::new(&project_path).join(".stash.lock");
    if !lock_path.exists() {
        return Err("No .stash.lock file found".to_string());
    }
    let mut lock = team::read_lock_file(&project_path)?;
    lock.metadata.insert(key, value);
    team::write_lock_file(&project_path, &lock)?;
    log::info!("Updated lock metadata");
    Ok(())
}

// ── Git identity helpers ──────────────────────────────────

/// Get the current git global user.name, or empty string if not set.
#[tauri::command]
pub fn get_git_username() -> Result<String, String> {
    if let Ok(output) = std::process::Command::new("git")
        .args(["config", "--global", "user.name"])
        .output()
    {
        if output.status.success() {
            let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Ok(name);
        }
    }
    Ok(String::new())
}

/// Set the git global user.name and return the value that was set.
#[tauri::command]
pub fn set_git_username(name: String) -> Result<String, String> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    let status = std::process::Command::new("git")
        .args(["config", "--global", "user.name", &trimmed])
        .status()
        .map_err(|e| format!("Failed to run git: {}", e))?;
    if !status.success() {
        return Err("git config --global user.name failed".to_string());
    }
    log::info!("Set git global user.name to {}", trimmed);
    Ok(trimmed)
}

/// Rename a member (by public key match) across all lock files for all projects.
#[tauri::command]
pub fn rename_lock_member(
    state: tauri::State<'_, AppState>,
    old_name: String,
    new_name: String,
) -> Result<usize, String> {
    let projects = state.projects.lock().map_err(|e| e.to_string())?;
    let mut updated_count = 0;

    for project in projects.iter() {
        let lock_path = std::path::Path::new(&project.path).join(".stash.lock");
        if !lock_path.exists() {
            continue;
        }
        let mut lock = team::read_lock_file(&project.path)?;
        let mut changed = false;

        // Rename in members list
        for member in &mut lock.members {
            if member.name == old_name {
                member.name = new_name.clone();
                changed = true;
            }
        }

        // Rename in per-profile encrypted variable maps
        for (_profile, profile_vars) in &mut lock.profiles {
            for (_key, member_map) in profile_vars.iter_mut() {
                if let Some(val) = member_map.remove(&old_name) {
                    member_map.insert(new_name.clone(), val);
                    changed = true;
                }
            }
        }

        // Rename in legacy v1 variables
        for (_key, member_map) in &mut lock.variables {
            if let Some(val) = member_map.remove(&old_name) {
                member_map.insert(new_name.clone(), val);
                changed = true;
            }
        }

        if changed {
            team::write_lock_file(&project.path, &lock)?;
            updated_count += 1;
        }
    }

    log::info!("Renamed member '{}' → '{}' in {} lock file(s)", old_name, new_name, updated_count);
    Ok(updated_count)
}
