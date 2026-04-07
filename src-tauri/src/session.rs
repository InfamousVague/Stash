use std::path::Path;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct Session {
    pub key: String, // base64-encoded vault key
    pub expires: u64, // unix timestamp
}

fn session_path() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".stash/session.json").to_string_lossy().to_string()
}

pub fn write_session(key: &[u8; 32]) {
    let expires = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() + 86400; // 24 hours

    let session = Session {
        key: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, key),
        expires,
    };

    if let Ok(json) = serde_json::to_string(&session) {
        std::fs::write(session_path(), json).ok();
    }
}

pub fn read_session() -> Option<[u8; 32]> {
    let path = session_path();
    if !Path::new(&path).exists() {
        return None;
    }

    let content = std::fs::read_to_string(&path).ok()?;
    let session: Session = serde_json::from_str(&content).ok()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if now >= session.expires {
        clear_session();
        return None;
    }

    let key_bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &session.key).ok()?;
    let key: [u8; 32] = key_bytes.try_into().ok()?;
    Some(key)
}

pub fn clear_session() {
    std::fs::remove_file(session_path()).ok();
}
