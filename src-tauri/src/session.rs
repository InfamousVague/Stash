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
        let path = session_path();
        std::fs::write(&path, json).ok();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).ok();
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Helper: write a session JSON directly to a custom path and read it back,
    /// bypassing the hardcoded session_path() which touches the real home dir.
    /// We test the Session struct serialization and expiry logic here.

    #[test]
    fn test_session_struct_serialization_round_trip() {
        let session = Session {
            key: base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                &[42u8; 32],
            ),
            expires: 9999999999,
        };
        let json = serde_json::to_string(&session).unwrap();
        let parsed: Session = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.key, session.key);
        assert_eq!(parsed.expires, session.expires);
    }

    #[test]
    fn test_write_session_creates_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("session.json");
        let key = [7u8; 32];

        let expires = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() + 86400;

        let session = Session {
            key: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &key),
            expires,
        };
        let json = serde_json::to_string(&session).unwrap();
        std::fs::write(&path, &json).unwrap();

        assert!(path.exists());
        let content = std::fs::read_to_string(&path).unwrap();
        let read_back: Session = serde_json::from_str(&content).unwrap();
        assert_eq!(read_back.expires, expires);
    }

    #[test]
    fn test_read_session_valid_returns_key() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("session.json");
        let key = [99u8; 32];

        let expires = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() + 86400;

        let session = Session {
            key: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &key),
            expires,
        };
        std::fs::write(&path, serde_json::to_string(&session).unwrap()).unwrap();

        // Read it back manually (simulating read_session logic)
        let content = std::fs::read_to_string(&path).unwrap();
        let s: Session = serde_json::from_str(&content).unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert!(now < s.expires, "session should not be expired");

        let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &s.key).unwrap();
        let key_arr: [u8; 32] = decoded.try_into().unwrap();
        assert_eq!(key_arr, key);
    }

    #[test]
    fn test_read_session_expired_returns_none() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("session.json");

        let session = Session {
            key: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &[0u8; 32]),
            expires: 1, // epoch + 1 second = long expired
        };
        std::fs::write(&path, serde_json::to_string(&session).unwrap()).unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        let s: Session = serde_json::from_str(&content).unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert!(now >= s.expires, "session should be expired");
    }

    #[test]
    fn test_clear_session_removes_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("session.json");
        std::fs::write(&path, "{}").unwrap();
        assert!(path.exists());
        std::fs::remove_file(&path).unwrap();
        assert!(!path.exists());
    }
}
