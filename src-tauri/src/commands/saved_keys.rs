use crate::state::AppState;
use crate::vault;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SavedKey {
    pub id: String,
    pub service_id: String,
    pub service_name: String,
    pub env_key: String,
    pub value: String,
    pub notes: String,
    pub created_at: u64,
}

fn read_saved_keys(state: &AppState) -> Result<Vec<SavedKey>, String> {
    let path = format!("{}/saved_keys.enc", state.stash_dir);
    if !std::path::Path::new(&path).exists() {
        return Ok(Vec::new());
    }
    let vault_key = state.vault_key.lock()
        .map_err(|_| "Lock poisoned".to_string())?;
    let key = vault_key.ok_or("Vault is not unlocked")?;

    let encrypted = std::fs::read(&path)
        .map_err(|e| format!("Failed to read saved keys: {}", e))?;
    let decrypted = vault::decrypt_with_key(&encrypted, &key)?;
    let json = String::from_utf8(decrypted)
        .map_err(|_| "Invalid saved keys data".to_string())?;
    let keys: Vec<SavedKey> = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse saved keys: {}", e))?;
    Ok(keys)
}

fn write_saved_keys(state: &AppState, keys: &[SavedKey]) -> Result<(), String> {
    let path = format!("{}/saved_keys.enc", state.stash_dir);
    let vault_key = state.vault_key.lock()
        .map_err(|_| "Lock poisoned".to_string())?;
    let key = vault_key.ok_or("Vault is not unlocked")?;

    let json = serde_json::to_string(keys)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    let encrypted = vault::encrypt_with_key(json.as_bytes(), &key)?;
    std::fs::write(&path, &encrypted)
        .map_err(|e| format!("Failed to write saved keys: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_saved_keys(state: tauri::State<'_, AppState>) -> Result<Vec<SavedKey>, String> {
    read_saved_keys(&state)
}

#[tauri::command]
pub fn add_saved_key(
    state: tauri::State<'_, AppState>,
    service_id: String,
    service_name: String,
    env_key: String,
    value: String,
    notes: String,
) -> Result<SavedKey, String> {
    let mut keys = read_saved_keys(&state)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let saved_key = SavedKey {
        id: uuid::Uuid::new_v4().to_string(),
        service_id,
        service_name,
        env_key,
        value,
        notes,
        created_at: now,
    };
    keys.push(saved_key.clone());
    write_saved_keys(&state, &keys)?;
    Ok(saved_key)
}

#[tauri::command]
pub fn update_saved_key(
    state: tauri::State<'_, AppState>,
    id: String,
    value: String,
    notes: String,
) -> Result<(), String> {
    let mut keys = read_saved_keys(&state)?;
    let entry = keys.iter_mut().find(|k| k.id == id)
        .ok_or("Key not found")?;
    entry.value = value;
    entry.notes = notes;
    write_saved_keys(&state, &keys)?;
    Ok(())
}

#[tauri::command]
pub fn delete_saved_key(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let mut keys = read_saved_keys(&state)?;
    let len_before = keys.len();
    keys.retain(|k| k.id != id);
    if keys.len() == len_before {
        return Err("Key not found".to_string());
    }
    write_saved_keys(&state, &keys)?;
    Ok(())
}

#[tauri::command]
pub fn get_saved_key_value(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    let keys = read_saved_keys(&state)?;
    let entry = keys.iter().find(|k| k.id == id)
        .ok_or("Key not found")?;
    Ok(entry.value.clone())
}
