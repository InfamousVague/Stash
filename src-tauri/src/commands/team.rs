use crate::state::AppState;
use crate::team::{self, TeamMember, LockFile};
use crate::env_parser;
use std::path::Path;
use std::collections::HashMap;

/// Collect local rotation timestamps for all keys in a project's profiles.
/// Returns a map of "profile:KEY" → unix timestamp.
fn collect_rotation_for_project(
    state: &AppState,
    project_id: &str,
    profile_names: &[String],
    project_path: &str,
) -> HashMap<String, u64> {
    let mut rotation_map: HashMap<String, u64> = HashMap::new();
    let rotation = match state.rotation.lock() {
        Ok(r) => r,
        Err(_) => return rotation_map,
    };
    let prefix = format!("{}:", project_id);
    for (composite_key, &ts) in rotation.iter() {
        if let Some(key) = composite_key.strip_prefix(&prefix) {
            // Figure out which profile this key belongs to
            for profile in profile_names {
                let profile_path = crate::helpers::profile_env_path(project_path, profile);
                if let Ok(vars) = crate::env_parser::read_env_file(&profile_path.to_string_lossy()) {
                    if vars.iter().any(|v| v.key == key) {
                        let lock_key = format!("{}:{}", profile, key);
                        rotation_map.insert(lock_key, ts);
                    }
                }
            }
        }
    }
    rotation_map
}

/// Merge rotation data from lock metadata into local state.
/// Takes the max timestamp for each key (most recent wins).
fn merge_rotation_from_lock(
    state: &AppState,
    project_id: &str,
    lock_rotation: &HashMap<String, u64>,
) {
    if lock_rotation.is_empty() {
        return;
    }
    if let Ok(mut rotation) = state.rotation.lock() {
        for (lock_key, &lock_ts) in lock_rotation {
            // lock_key is "profile:KEY" — extract just the KEY part
            let env_key = lock_key.splitn(2, ':').nth(1).unwrap_or(lock_key);
            let composite = format!("{}:{}", project_id, env_key);
            let local_ts = rotation.get(&composite).copied().unwrap_or(0);
            if lock_ts > local_ts {
                rotation.insert(composite, lock_ts);
            }
        }
        // Save updated rotation to disk
        let path = format!("{}/rotation.json", state.stash_dir);
        if let Ok(json) = serde_json::to_string(&*rotation) {
            std::fs::write(path, json).ok();
        }
    }
}

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
            crate::helpers::profile_env_path(&project_path, "default")
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
        let env_path = crate::helpers::profile_env_path(&project_path, "default");
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

/// Inner push logic, callable from the tauri command and from auto-push.
pub fn push_lock_inner(
    state: &AppState,
    project_id: &str,
) -> Result<(), String> {
    use crate::profile_manager;

    let project_path = state.get_project_path(project_id)?;

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
            crate::helpers::profile_env_path(&project_path, "default")
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
        let env_path = crate::helpers::profile_env_path(&project_path, "default");
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

    // Merge local rotation timestamps into lock metadata
    let profile_names: Vec<String> = lock.profiles.keys().cloned().collect();
    let local_rotation = collect_rotation_for_project(state, project_id, &profile_names, &project_path);
    if !local_rotation.is_empty() {
        let mut lock_rotation: HashMap<String, u64> = lock.metadata
            .get("rotation")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();
        for (key, ts) in &local_rotation {
            let existing = lock_rotation.get(key).copied().unwrap_or(0);
            if *ts > existing {
                lock_rotation.insert(key.clone(), *ts);
            }
        }
        lock.metadata.insert("rotation".to_string(), serde_json::to_value(&lock_rotation).unwrap_or_default());
    }

    team::write_lock_file(&project_path, &lock)?;
    let profile_count = lock.profiles.len();
    let var_count: usize = lock.profiles.values().map(|p| p.len()).sum();
    log::info!("Pushed {} profiles, {} vars to .stash.lock for {} members", profile_count, var_count, lock.members.len());
    Ok(())
}

#[tauri::command]
pub fn push_lock(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    push_lock_inner(&state, &project_id)
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

            let profile_path = crate::helpers::profile_env_path(&project_path, profile_name);
            // Backup before overwriting
            if profile_path.exists() {
                let backup_path = crate::helpers::profile_backup_path(&project_path, profile_name);
                std::fs::copy(&profile_path, &backup_path)
                    .map_err(|e| format!("Backup failed for {}: {}", profile_name, e))?;
            }
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
        // Merge rotation timestamps from lock into local state
        if let Some(lock_rotation_value) = lock.metadata.get("rotation") {
            if let Ok(lock_rotation) = serde_json::from_value::<HashMap<String, u64>>(lock_rotation_value.clone()) {
                merge_rotation_from_lock(&state, &project_id, &lock_rotation);
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

    let env_path = crate::helpers::profile_env_path(&project_path, "default");
    // Backup before overwriting
    if env_path.exists() {
        let backup_path = crate::helpers::profile_backup_path(&project_path, "default");
        std::fs::copy(&env_path, &backup_path)
            .map_err(|e| format!("Backup failed: {}", e))?;
    }
    let content = vars.iter()
        .map(|v| format!("{}={}", v.key, v.value))
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&env_path, content)
        .map_err(|e| format!("Failed to write .env: {}", e))?;

    log::info!("Pulled {} vars from .stash.lock", vars.len());
    Ok(vars)
}

// ── Pull conflict resolution structs ─────────────────────

#[derive(serde::Serialize, Clone)]
pub struct ChangedVar {
    pub key: String,
    pub local_value: String,
    pub incoming_value: String,
}

#[derive(serde::Serialize, Clone)]
pub struct ProfilePullDiff {
    pub name: String,
    pub added: Vec<crate::state::EnvVar>,
    pub removed: Vec<String>,
    pub changed: Vec<ChangedVar>,
    pub unchanged: usize,
}

#[derive(serde::Serialize, Clone)]
pub struct PullPreview {
    pub profiles: Vec<ProfilePullDiff>,
}

// ── Shared decrypt helper ────────────────────────────────

/// Decrypt all profiles from a lock file without writing to disk.
/// Returns a map of profile_name → Vec<EnvVar>.
fn decrypt_lock_profiles(
    lock: &crate::team::LockFile,
    private_key_b64: &str,
    my_name: &str,
) -> Result<HashMap<String, Vec<crate::state::EnvVar>>, String> {
    let mut result: HashMap<String, Vec<crate::state::EnvVar>> = HashMap::new();

    if !lock.profiles.is_empty() {
        // v2 format
        for (profile_name, profile_vars) in &lock.profiles {
            let mut vars = Vec::new();
            for (key, encrypted_map) in profile_vars {
                if let Some(encrypted) = encrypted_map.get(my_name) {
                    match crate::team::decrypt_with_private_key(encrypted, private_key_b64) {
                        Ok(value) => vars.push(crate::state::EnvVar { key: key.clone(), value }),
                        Err(e) => log::warn!("Failed to decrypt {} in profile {}: {}", key, profile_name, e),
                    }
                }
            }
            result.insert(profile_name.clone(), vars);
        }
    } else if !lock.variables.is_empty() {
        // Legacy v1 format
        let mut vars = Vec::new();
        for (key, encrypted_map) in &lock.variables {
            if let Some(encrypted) = encrypted_map.get(my_name) {
                match crate::team::decrypt_with_private_key(encrypted, private_key_b64) {
                    Ok(value) => vars.push(crate::state::EnvVar { key: key.clone(), value }),
                    Err(e) => log::warn!("Failed to decrypt {}: {}", key, e),
                }
            }
        }
        result.insert("default".to_string(), vars);
    }

    Ok(result)
}

// ── Preview and apply pull commands ──────────────────────

#[tauri::command]
pub fn preview_pull(
    state: tauri::State<'_, crate::state::AppState>,
    project_id: String,
) -> Result<PullPreview, String> {
    let project_path = state.get_project_path(&project_id)?;
    let lock = team::read_lock_file(&project_path)?;
    let (private_key, my_public) = team::load_keypair(&state.stash_dir)?;

    let my_name = lock.members.iter()
        .find(|m| m.public_key == my_public)
        .map(|m| m.name.clone())
        .ok_or("You are not a member of this lock file")?;

    let incoming = decrypt_lock_profiles(&lock, &private_key, &my_name)?;

    let mut profiles = Vec::new();
    for (profile_name, incoming_vars) in &incoming {
        // Read local vars from disk
        let profile_path = crate::helpers::profile_env_path(&project_path, profile_name);

        let local_vars = if profile_path.exists() {
            env_parser::read_env_file(&profile_path.to_string_lossy()).unwrap_or_default()
        } else {
            Vec::new()
        };

        // Build lookup maps
        let local_map: HashMap<&str, &str> = local_vars.iter()
            .map(|v| (v.key.as_str(), v.value.as_str()))
            .collect();
        let incoming_map: HashMap<&str, &str> = incoming_vars.iter()
            .map(|v| (v.key.as_str(), v.value.as_str()))
            .collect();

        let mut added = Vec::new();
        let mut changed = Vec::new();
        let mut unchanged: usize = 0;

        // Keys in incoming
        for var in incoming_vars {
            match local_map.get(var.key.as_str()) {
                None => {
                    added.push(crate::state::EnvVar { key: var.key.clone(), value: var.value.clone() });
                }
                Some(&local_val) => {
                    if local_val != var.value {
                        changed.push(ChangedVar {
                            key: var.key.clone(),
                            local_value: local_val.to_string(),
                            incoming_value: var.value.clone(),
                        });
                    } else {
                        unchanged += 1;
                    }
                }
            }
        }

        // Keys in local but not in incoming → removed
        let removed: Vec<String> = local_vars.iter()
            .filter(|v| !incoming_map.contains_key(v.key.as_str()))
            .map(|v| v.key.clone())
            .collect();

        profiles.push(ProfilePullDiff {
            name: profile_name.clone(),
            added,
            removed,
            changed,
            unchanged,
        });
    }

    Ok(PullPreview { profiles })
}

#[tauri::command]
pub fn apply_pull(
    state: tauri::State<'_, crate::state::AppState>,
    project_id: String,
    accepted_keys: HashMap<String, Vec<String>>,
) -> Result<Vec<crate::state::EnvVar>, String> {
    use crate::profile_manager;

    let project_path = state.get_project_path(&project_id)?;
    let lock = team::read_lock_file(&project_path)?;
    let (private_key, my_public) = team::load_keypair(&state.stash_dir)?;

    let my_name = lock.members.iter()
        .find(|m| m.public_key == my_public)
        .map(|m| m.name.clone())
        .ok_or("You are not a member of this lock file")?;

    let incoming = decrypt_lock_profiles(&lock, &private_key, &my_name)?;

    for (profile_name, incoming_vars) in &incoming {
        let accepted = match accepted_keys.get(profile_name) {
            Some(keys) => keys,
            None => continue, // No accepted keys for this profile, skip
        };

        let profile_path = crate::helpers::profile_env_path(&project_path, profile_name);

        // Read local vars
        let local_vars = if profile_path.exists() {
            env_parser::read_env_file(&profile_path.to_string_lossy()).unwrap_or_default()
        } else {
            Vec::new()
        };

        // Build incoming map
        let incoming_map: HashMap<&str, &str> = incoming_vars.iter()
            .map(|v| (v.key.as_str(), v.value.as_str()))
            .collect();

        // Build merged result: start with local, apply accepted changes
        let accepted_set: std::collections::HashSet<&str> = accepted.iter()
            .map(|s| s.as_str())
            .collect();

        let mut merged: Vec<crate::state::EnvVar> = Vec::new();

        // Process existing local vars
        for var in &local_vars {
            if accepted_set.contains(var.key.as_str()) {
                // This key was accepted for incoming changes
                if let Some(&incoming_val) = incoming_map.get(var.key.as_str()) {
                    // Replace with incoming value
                    merged.push(crate::state::EnvVar { key: var.key.clone(), value: incoming_val.to_string() });
                } else {
                    // Key is not in incoming → it's a removal, accepted means remove it
                    // Don't add to merged
                }
            } else {
                // Not accepted, keep local value
                merged.push(var.clone());
            }
        }

        // Add new keys from incoming that were accepted
        let local_keys: std::collections::HashSet<&str> = local_vars.iter()
            .map(|v| v.key.as_str())
            .collect();
        for var in incoming_vars {
            if !local_keys.contains(var.key.as_str()) && accepted_set.contains(var.key.as_str()) {
                merged.push(crate::state::EnvVar { key: var.key.clone(), value: var.value.clone() });
            }
        }

        // Backup existing file before writing
        if profile_path.exists() {
            let backup_path = crate::helpers::profile_backup_path(&project_path, profile_name);
            std::fs::copy(&profile_path, &backup_path)
                .map_err(|e| format!("Backup failed for {}: {}", profile_name, e))?;
        }

        // Write merged vars
        env_parser::write_env_file(&profile_path.to_string_lossy(), &merged)?;
    }

    // Merge rotation timestamps from lock metadata
    if let Some(lock_rotation_value) = lock.metadata.get("rotation") {
        if let Ok(lock_rotation) = serde_json::from_value::<HashMap<String, u64>>(lock_rotation_value.clone()) {
            merge_rotation_from_lock(&state, &project_id, &lock_rotation);
        }
    }

    // Return the active profile's vars
    let active = profile_manager::get_active_profile(&project_path);
    let active_path = crate::helpers::profile_env_path(&project_path, &active);

    if active_path.exists() {
        env_parser::read_env_file(&active_path.to_string_lossy())
    } else {
        Ok(Vec::new())
    }
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
            crate::helpers::profile_env_path(&project_path, "default")
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

// ── Git pre-commit hook ──────────────────────────────────

const HOOK_MARKER: &str = "# STASH_MANAGED_HOOK";

const HOOK_SCRIPT: &str = r#"#!/bin/sh
# STASH_MANAGED_HOOK — installed by Stash app
# Auto-push .env changes to .stash.lock before each commit

if command -v stash >/dev/null 2>&1; then
  stash push 2>/dev/null || true
elif [ -x /usr/local/bin/stash ]; then
  /usr/local/bin/stash push 2>/dev/null || true
fi
"#;

#[tauri::command]
pub fn install_git_hook(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    let hooks_dir = Path::new(&project_path).join(".git").join("hooks");

    if !hooks_dir.parent().map(|p| p.exists()).unwrap_or(false) {
        return Err("Not a git repository".to_string());
    }

    std::fs::create_dir_all(&hooks_dir)
        .map_err(|e| format!("Failed to create hooks dir: {}", e))?;

    let hook_path = hooks_dir.join("pre-commit");

    if hook_path.exists() {
        let existing = std::fs::read_to_string(&hook_path)
            .map_err(|e| format!("Failed to read existing hook: {}", e))?;
        if existing.contains(HOOK_MARKER) {
            // Already installed, update it
            std::fs::write(&hook_path, HOOK_SCRIPT)
                .map_err(|e| format!("Failed to write hook: {}", e))?;
        } else {
            // Append to existing hook
            let combined = format!("{}\n\n{}", existing.trim_end(), HOOK_SCRIPT);
            std::fs::write(&hook_path, combined)
                .map_err(|e| format!("Failed to write hook: {}", e))?;
        }
    } else {
        std::fs::write(&hook_path, HOOK_SCRIPT)
            .map_err(|e| format!("Failed to write hook: {}", e))?;
    }

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&hook_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set hook permissions: {}", e))?;
    }

    log::info!("Installed pre-commit hook at {}", hook_path.display());
    Ok(())
}

#[tauri::command]
pub fn remove_git_hook(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let project_path = state.get_project_path(&project_id)?;
    let hook_path = Path::new(&project_path).join(".git").join("hooks").join("pre-commit");

    if !hook_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&hook_path)
        .map_err(|e| format!("Failed to read hook: {}", e))?;

    if !content.contains(HOOK_MARKER) {
        // Not our hook, don't touch it
        return Ok(());
    }

    // If the entire file is our hook, remove it
    // Otherwise strip out our section
    let lines: Vec<&str> = content.lines().collect();
    let is_only_ours = lines.iter().all(|l| {
        let t = l.trim();
        t.is_empty() || t.starts_with('#') || t.starts_with("if ") || t.starts_with("stash ")
            || t.starts_with("elif") || t.starts_with("fi") || t.contains("stash") || t.contains("STASH")
            || t.starts_with("/usr/local/bin/stash")
    });

    if is_only_ours {
        std::fs::remove_file(&hook_path)
            .map_err(|e| format!("Failed to remove hook: {}", e))?;
        log::info!("Removed pre-commit hook at {}", hook_path.display());
    } else {
        // Strip our section out
        let mut cleaned = String::new();
        let mut in_stash_block = false;
        for line in content.lines() {
            if line.contains(HOOK_MARKER) {
                in_stash_block = true;
                continue;
            }
            if in_stash_block {
                if line.trim() == "fi" {
                    in_stash_block = false;
                    continue;
                }
                continue;
            }
            cleaned.push_str(line);
            cleaned.push('\n');
        }
        std::fs::write(&hook_path, cleaned.trim_end())
            .map_err(|e| format!("Failed to write hook: {}", e))?;
        log::info!("Stripped stash section from pre-commit hook");
    }

    Ok(())
}

#[tauri::command]
pub fn encrypt_for_person(
    _state: tauri::State<'_, crate::state::AppState>,
    value: String,
    recipient_public_key: String,
) -> Result<String, String> {
    crate::team::encrypt_for_recipient(&value, &recipient_public_key)
        .map_err(|e| format!("Encryption failed: {}", e))
}

#[tauri::command]
pub fn decrypt_from_person(
    state: tauri::State<'_, crate::state::AppState>,
    encrypted: String,
) -> Result<String, String> {
    let (private_key, _) = crate::team::load_keypair(&state.stash_dir)
        .map_err(|e| format!("No keypair: {}", e))?;
    crate::team::decrypt_with_private_key(&encrypted, &private_key)
        .map_err(|e| format!("Decryption failed: {}", e))
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct ChangelogEntry {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[tauri::command]
pub fn get_lock_changelog(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<ChangelogEntry>, String> {
    let project_path = state.get_project_path(&project_id)?;

    // Check if it's a git repo
    let git_dir = std::path::Path::new(&project_path).join(".git");
    if !git_dir.exists() {
        return Ok(Vec::new());
    }

    let output = std::process::Command::new("git")
        .args(["log", "--format=%H|%an|%ai|%s", "-20", "--", ".stash.lock"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(4, '|');
        let hash = parts.next().unwrap_or("").to_string();
        let author = parts.next().unwrap_or("").to_string();
        let date = parts.next().unwrap_or("").to_string();
        let message = parts.next().unwrap_or("").to_string();
        entries.push(ChangelogEntry { hash, author, date, message });
    }

    Ok(entries)
}
