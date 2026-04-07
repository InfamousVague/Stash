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
