use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use argon2::{Argon2, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use rand::rngs::OsRng;

use crate::config::RelayConfig;
use crate::db::Database;

/// Derive a 32-byte encryption key from a passphrase + salt using Argon2id
pub fn derive_key(passphrase: &str, salt: &[u8]) -> [u8; 32] {
    use argon2::{Algorithm, Version, Params};
    let params = Params::new(65536, 3, 1, Some(32)).unwrap();
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2.hash_password_into(passphrase.as_bytes(), salt, &mut key).unwrap();
    key
}

/// Encrypt data with AES-256-GCM
pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> anyhow::Result<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key)?;
    let nonce_bytes: [u8; 12] = rand::random();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext)
        .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;
    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Decrypt data with AES-256-GCM (expects nonce prepended)
pub fn decrypt(key: &[u8; 32], data: &[u8]) -> anyhow::Result<Vec<u8>> {
    if data.len() < 12 {
        anyhow::bail!("Data too short to contain nonce");
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key)?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;
    Ok(plaintext)
}

/// Hash a token for storage using Argon2
pub fn hash_token(token: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(token.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("Hash failed: {}", e))?;
    Ok(hash.to_string())
}

/// Verify a token against an Argon2 hash
pub fn verify_token(token: &str, hash: &str) -> bool {
    let parsed = match argon2::PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default().verify_password(token.as_bytes(), &parsed).is_ok()
}

/// Generate a random API token
pub fn generate_token() -> String {
    use base64::Engine;
    let bytes: [u8; 32] = rand::random();
    format!("stash_{}", base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

/// Auto-setup or unlock master encryption key.
/// On first run, generates a random passphrase automatically.
/// On subsequent runs, reads the passphrase from the data directory.
pub async fn setup_or_unlock(db: &Database, config: &RelayConfig) -> anyhow::Result<[u8; 32]> {
    let passphrase_path = config.data_dir().join(".master");
    let existing_salt = db.get_master_salt()?;

    if let Some(salt) = existing_salt {
        let verify_data = db.get_master_verify()?
            .ok_or_else(|| anyhow::anyhow!("Corrupted DB: salt exists but no verify token"))?;

        let passphrase = std::fs::read_to_string(&passphrase_path)
            .map_err(|_| anyhow::anyhow!(
                "Master passphrase file missing at {:?}. Cannot unlock encryption keys.",
                passphrase_path
            ))?;
        let passphrase = passphrase.trim().to_string();

        let key = derive_key(&passphrase, &salt);
        if decrypt(&key, &verify_data).is_ok() {
            tracing::info!("Master key unlocked");
            return Ok(key);
        }
        anyhow::bail!("Master passphrase file is invalid. Cannot unlock encryption keys.");
    } else {
        tracing::info!("First-time setup — generating master key");

        use base64::Engine;
        let random_bytes: [u8; 32] = rand::random();
        let passphrase = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(random_bytes);

        let salt: [u8; 16] = rand::random();
        let key = derive_key(&passphrase, &salt);

        let verify_plaintext = b"stash-relay-verify";
        let verify_encrypted = encrypt(&key, verify_plaintext)?;
        db.set_master_credentials(&salt, &verify_encrypted)?;

        let data_dir = config.data_dir();
        std::fs::create_dir_all(&data_dir)?;
        std::fs::write(&passphrase_path, &passphrase)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&passphrase_path, std::fs::Permissions::from_mode(0o600))?;
        }

        let admin_user_id = db.find_or_create_user("setup:admin", None)?;

        let token = generate_token();
        let token_hash = hash_token(&token)?;
        let token_id = uuid::Uuid::new_v4().to_string();
        db.store_token(&token_id, &admin_user_id, "Initial setup token", &token_hash, Some("cli"))?;

        println!();
        println!("  +---------------------------------------------------+");
        println!("  |            Stash Relay -- First Run                |");
        println!("  +---------------------------------------------------+");
        println!("  |                                                   |");
        println!("  |  Your API token (save this!):                     |");
        println!("  |                                                   |");
        println!("  |  {}  |", &token);
        println!("  |                                                   |");
        println!("  |  Paste this token into the Stash app to connect.  |");
        println!("  |  It won't be shown again.                         |");
        println!("  |                                                   |");
        println!("  +---------------------------------------------------+");
        println!();

        Ok(key)
    }
}
