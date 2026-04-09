use aes_gcm::{Aes256Gcm, Nonce, aead::{Aead, KeyInit}};
use argon2::Argon2;
use rand::RngCore;
use std::path::Path;

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], String> {
    let mut key = [0u8; KEY_LEN];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Key derivation failed: {}", e))?;
    Ok(key)
}

fn encrypt(data: &[u8], key: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher init failed: {}", e))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, data)
        .map_err(|e| format!("Encryption failed: {}", e))?;
    // Prepend nonce to ciphertext
    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

fn decrypt(data: &[u8], key: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    if data.len() < NONCE_LEN {
        return Err("Data too short".to_string());
    }
    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher init failed: {}", e))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "Incorrect password".to_string())
}

pub fn is_vault_initialized(stash_dir: &str) -> bool {
    let vault_path = Path::new(stash_dir).join("vault.enc");
    let salt_path = Path::new(stash_dir).join("salt");
    vault_path.exists() && salt_path.exists()
}

pub fn init_vault(password: &str, stash_dir: &str) -> Result<[u8; KEY_LEN], String> {
    let mut salt = [0u8; SALT_LEN];
    rand::rngs::OsRng.fill_bytes(&mut salt);

    let key = derive_key(password, &salt)?;
    let empty_vault = b"{}";
    let encrypted = encrypt(empty_vault, &key)?;

    std::fs::write(Path::new(stash_dir).join("salt"), &salt)
        .map_err(|e| format!("Failed to write salt: {}", e))?;
    std::fs::write(Path::new(stash_dir).join("vault.enc"), &encrypted)
        .map_err(|e| format!("Failed to write vault: {}", e))?;

    log::info!("Vault initialized at {}", stash_dir);
    Ok(key)
}

/// Encrypt data with a known key. Used by saved_keys and other modules that need direct encryption.
pub fn encrypt_with_key(data: &[u8], key: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    encrypt(data, key)
}

/// Decrypt data with a known key. Used by keychain unlock to verify the key is still valid.
pub fn decrypt_with_key(data: &[u8], key: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    decrypt(data, key)
}

pub fn unlock_vault(password: &str, stash_dir: &str) -> Result<[u8; KEY_LEN], String> {
    let salt = std::fs::read(Path::new(stash_dir).join("salt"))
        .map_err(|e| format!("Failed to read salt: {}", e))?;
    let encrypted = std::fs::read(Path::new(stash_dir).join("vault.enc"))
        .map_err(|e| format!("Failed to read vault: {}", e))?;

    let key = derive_key(password, &salt)?;
    // Verify we can decrypt
    decrypt(&encrypted, &key)?;

    log::info!("Vault unlocked");
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_is_vault_initialized_false_when_empty() {
        let dir = TempDir::new().unwrap();
        assert!(!is_vault_initialized(dir.path().to_str().unwrap()));
    }

    #[test]
    fn test_init_vault_creates_files() {
        let dir = TempDir::new().unwrap();
        let stash = dir.path().to_str().unwrap();
        let _key = init_vault("testpass", stash).unwrap();

        assert!(dir.path().join("salt").exists(), "salt file should exist");
        assert!(dir.path().join("vault.enc").exists(), "vault.enc file should exist");
    }

    #[test]
    fn test_is_vault_initialized_true_after_init() {
        let dir = TempDir::new().unwrap();
        let stash = dir.path().to_str().unwrap();
        init_vault("testpass", stash).unwrap();
        assert!(is_vault_initialized(stash));
    }

    #[test]
    fn test_unlock_vault_correct_password() {
        let dir = TempDir::new().unwrap();
        let stash = dir.path().to_str().unwrap();
        let init_key = init_vault("mypassword", stash).unwrap();
        let unlock_key = unlock_vault("mypassword", stash).unwrap();
        assert_eq!(init_key, unlock_key, "init and unlock should derive the same key");
    }

    #[test]
    fn test_unlock_vault_wrong_password() {
        let dir = TempDir::new().unwrap();
        let stash = dir.path().to_str().unwrap();
        init_vault("correct", stash).unwrap();
        let result = unlock_vault("wrong", stash);
        assert!(result.is_err(), "wrong password should fail");
        assert!(result.unwrap_err().contains("Incorrect password"));
    }

    #[test]
    fn test_unlock_vault_no_vault_files() {
        let dir = TempDir::new().unwrap();
        let result = unlock_vault("any", dir.path().to_str().unwrap());
        assert!(result.is_err(), "should fail when no vault files exist");
    }

    #[test]
    fn test_derive_key_deterministic() {
        let salt = [1u8; SALT_LEN];
        let key1 = derive_key("password", &salt).unwrap();
        let key2 = derive_key("password", &salt).unwrap();
        assert_eq!(key1, key2, "same password + salt should produce same key");
    }

    #[test]
    fn test_derive_key_different_passwords() {
        let salt = [1u8; SALT_LEN];
        let key1 = derive_key("password1", &salt).unwrap();
        let key2 = derive_key("password2", &salt).unwrap();
        assert_ne!(key1, key2, "different passwords should produce different keys");
    }

    #[test]
    fn test_encrypt_decrypt_round_trip() {
        let key = [42u8; KEY_LEN];
        let plaintext = b"hello vault";
        let encrypted = encrypt(plaintext, &key).unwrap();
        let decrypted = decrypt(&encrypted, &key).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_decrypt_wrong_key_fails() {
        let key1 = [1u8; KEY_LEN];
        let key2 = [2u8; KEY_LEN];
        let encrypted = encrypt(b"secret", &key1).unwrap();
        let result = decrypt(&encrypted, &key2);
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_data_too_short() {
        let key = [1u8; KEY_LEN];
        let result = decrypt(&[0u8; 5], &key);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too short"));
    }
}
