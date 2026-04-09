use crate::state::AppState;
use base64::Engine;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Contact {
    pub name: String,
    pub public_key: String,
    pub added_at: u64,
}

fn contacts_path(stash_dir: &str) -> String {
    format!("{}/contacts.json", stash_dir)
}

fn read_contacts(stash_dir: &str) -> Result<Vec<Contact>, String> {
    let path = contacts_path(stash_dir);
    if !std::path::Path::new(&path).exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read contacts: {}", e))?;
    let contacts: Vec<Contact> = serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse contacts: {}", e))?;
    Ok(contacts)
}

fn write_contacts(stash_dir: &str, contacts: &[Contact]) -> Result<(), String> {
    let path = contacts_path(stash_dir);
    let json = serde_json::to_string_pretty(contacts)
        .map_err(|e| format!("Failed to serialize contacts: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write contacts: {}", e))?;
    Ok(())
}

/// Simple percent-encoding for use in stash:// URLs.
fn simple_percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            ' ' => out.push_str("%20"),
            '&' => out.push_str("%26"),
            '=' => out.push_str("%3D"),
            '?' => out.push_str("%3F"),
            '#' => out.push_str("%23"),
            '%' => out.push_str("%25"),
            '+' => out.push_str("%2B"),
            _ => out.push(ch),
        }
    }
    out
}

#[tauri::command]
pub fn list_contacts(state: tauri::State<'_, AppState>) -> Result<Vec<Contact>, String> {
    read_contacts(&state.stash_dir)
}

#[tauri::command]
pub fn add_contact(
    state: tauri::State<'_, AppState>,
    name: String,
    public_key: String,
) -> Result<(), String> {
    // Validate name
    if name.is_empty() || name.len() > 100 {
        return Err("Name must be 1-100 characters".to_string());
    }

    // Validate public key is valid 32-byte base64
    let key_bytes = base64::engine::general_purpose::STANDARD
        .decode(&public_key)
        .map_err(|_| "Invalid public key format".to_string())?;
    if key_bytes.len() != 32 {
        return Err("Public key must be 32 bytes".to_string());
    }

    let mut contacts = read_contacts(&state.stash_dir)?;

    // Check for duplicate by public_key
    if contacts.iter().any(|c| c.public_key == public_key) {
        return Err("Contact with this public key already exists".to_string());
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    contacts.push(Contact {
        name,
        public_key,
        added_at: now,
    });

    write_contacts(&state.stash_dir, &contacts)?;
    log::info!("Added contact, total: {}", contacts.len());
    Ok(())
}

#[tauri::command]
pub fn remove_contact(
    state: tauri::State<'_, AppState>,
    public_key: String,
) -> Result<(), String> {
    let mut contacts = read_contacts(&state.stash_dir)?;
    let before = contacts.len();
    contacts.retain(|c| c.public_key != public_key);
    if contacts.len() == before {
        return Err("Contact not found".to_string());
    }
    write_contacts(&state.stash_dir, &contacts)?;
    log::info!("Removed contact, remaining: {}", contacts.len());
    Ok(())
}

#[tauri::command]
pub fn generate_share_link(name: String, public_key: String) -> String {
    format!(
        "stash://add-contact?name={}&key={}",
        simple_percent_encode(&name),
        public_key,
    )
}
