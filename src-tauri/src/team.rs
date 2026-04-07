use aes_gcm::{Aes256Gcm, Nonce, aead::{Aead, KeyInit}};
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use rand::RngCore;
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::path::Path;
use x25519_dalek::{EphemeralSecret, PublicKey, StaticSecret};

/// Team member in a .stash.lock file
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct TeamMember {
    pub name: String,
    pub public_key: String, // base64-encoded X25519 public key
}

/// A .stash.lock file
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct LockFile {
    pub version: u32,
    pub members: Vec<TeamMember>,
    pub variables: HashMap<String, HashMap<String, String>>, // key -> { member_name -> encrypted_base64 }
    pub profile: String,
}

/// Generate an X25519 keypair. Returns (private_key_base64, public_key_base64).
pub fn generate_keypair() -> (String, String) {
    let mut rng = rand::rngs::OsRng;
    let mut secret_bytes = [0u8; 32];
    rng.fill_bytes(&mut secret_bytes);
    let secret = StaticSecret::from(secret_bytes);
    let public = PublicKey::from(&secret);
    (B64.encode(secret_bytes), B64.encode(public.as_bytes()))
}

/// Load a keypair from the stash directory. Returns (private_b64, public_b64).
pub fn load_keypair(stash_dir: &str) -> Result<(String, String), String> {
    let key_path = format!("{}/keypair.json", stash_dir);
    let content = std::fs::read_to_string(&key_path)
        .map_err(|_| "No keypair found. Generate one first.".to_string())?;
    let keypair: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid keypair file: {}", e))?;
    let private = keypair["private"].as_str()
        .ok_or("Missing private key in keypair file")?.to_string();
    let public = keypair["public"].as_str()
        .ok_or("Missing public key in keypair file")?.to_string();
    Ok((private, public))
}

/// Encrypt a value for a recipient using X25519 + AES-256-GCM.
/// Uses an ephemeral key so each encryption is unique.
pub fn encrypt_for_recipient(value: &str, recipient_public_key_b64: &str) -> Result<String, String> {
    let recipient_pub_bytes: [u8; 32] = B64.decode(recipient_public_key_b64)
        .map_err(|e| format!("Invalid public key: {}", e))?
        .try_into()
        .map_err(|_| "Public key must be 32 bytes".to_string())?;

    let recipient_pub = PublicKey::from(recipient_pub_bytes);

    // Generate ephemeral keypair for this encryption
    let ephemeral_secret = EphemeralSecret::random_from_rng(rand::rngs::OsRng);
    let ephemeral_public = PublicKey::from(&ephemeral_secret);

    // Derive shared secret
    let shared = ephemeral_secret.diffie_hellman(&recipient_pub);
    let mut hasher = Sha256::new();
    hasher.update(shared.as_bytes());
    let key_bytes: [u8; 32] = hasher.finalize().into();

    // Encrypt with AES-256-GCM
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| format!("Cipher init: {}", e))?;
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, value.as_bytes())
        .map_err(|e| format!("Encrypt: {}", e))?;

    // Pack: ephemeral_public(32) + nonce(12) + ciphertext
    let mut packed = Vec::with_capacity(32 + 12 + ciphertext.len());
    packed.extend_from_slice(ephemeral_public.as_bytes());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);

    Ok(B64.encode(&packed))
}

/// Decrypt a value using our private key.
pub fn decrypt_with_private_key(encrypted_b64: &str, private_key_b64: &str) -> Result<String, String> {
    let packed = B64.decode(encrypted_b64)
        .map_err(|e| format!("Invalid ciphertext: {}", e))?;

    if packed.len() < 44 { // 32 + 12 minimum
        return Err("Ciphertext too short".to_string());
    }

    let private_bytes: [u8; 32] = B64.decode(private_key_b64)
        .map_err(|e| format!("Invalid private key: {}", e))?
        .try_into()
        .map_err(|_| "Private key must be 32 bytes".to_string())?;

    let secret = StaticSecret::from(private_bytes);

    // Unpack
    let ephemeral_pub_bytes: [u8; 32] = packed[..32].try_into().unwrap();
    let nonce_bytes: [u8; 12] = packed[32..44].try_into().unwrap();
    let ciphertext = &packed[44..];

    let ephemeral_pub = PublicKey::from(ephemeral_pub_bytes);

    // Derive same shared secret
    let shared = secret.diffie_hellman(&ephemeral_pub);
    let mut hasher = Sha256::new();
    hasher.update(shared.as_bytes());
    let key_bytes: [u8; 32] = hasher.finalize().into();

    // Decrypt
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| format!("Cipher init: {}", e))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed — wrong key or corrupted data".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 error: {}", e))
}

/// Read a .stash.lock file from a project directory.
pub fn read_lock_file(project_path: &str) -> Result<LockFile, String> {
    let path = Path::new(project_path).join(".stash.lock");
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Can't read .stash.lock: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Invalid .stash.lock: {}", e))
}

/// Write a .stash.lock file to a project directory.
pub fn write_lock_file(project_path: &str, lock: &LockFile) -> Result<(), String> {
    let path = Path::new(project_path).join(".stash.lock");
    let json = serde_json::to_string_pretty(lock)
        .map_err(|e| format!("Serialize error: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Can't write .stash.lock: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // ── generate_keypair ──────────────────────────────────────

    #[test]
    fn test_generate_keypair_produces_valid_base64() {
        let (private_b64, public_b64) = generate_keypair();
        let private_bytes = B64.decode(&private_b64).unwrap();
        let public_bytes = B64.decode(&public_b64).unwrap();
        assert_eq!(private_bytes.len(), 32, "private key should be 32 bytes");
        assert_eq!(public_bytes.len(), 32, "public key should be 32 bytes");
    }

    #[test]
    fn test_generate_keypair_unique_each_call() {
        let (priv1, pub1) = generate_keypair();
        let (priv2, pub2) = generate_keypair();
        assert_ne!(priv1, priv2, "two keypairs should have different private keys");
        assert_ne!(pub1, pub2, "two keypairs should have different public keys");
    }

    // ── encrypt / decrypt round-trip ──────────────────────────

    #[test]
    fn test_encrypt_decrypt_round_trip() {
        let (private_b64, public_b64) = generate_keypair();
        let plaintext = "super-secret-api-key-12345";

        let encrypted = encrypt_for_recipient(plaintext, &public_b64).unwrap();
        let decrypted = decrypt_with_private_key(&encrypted, &private_b64).unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_encrypt_decrypt_empty_string() {
        let (private_b64, public_b64) = generate_keypair();
        let encrypted = encrypt_for_recipient("", &public_b64).unwrap();
        let decrypted = decrypt_with_private_key(&encrypted, &private_b64).unwrap();
        assert_eq!(decrypted, "");
    }

    #[test]
    fn test_decrypt_with_wrong_key_fails() {
        let (_priv1, pub1) = generate_keypair();
        let (priv2, _pub2) = generate_keypair();

        let encrypted = encrypt_for_recipient("secret", &pub1).unwrap();
        let result = decrypt_with_private_key(&encrypted, &priv2);
        assert!(result.is_err(), "decryption with wrong key should fail");
    }

    #[test]
    fn test_encrypt_each_call_produces_different_ciphertext() {
        let (_priv, pub_key) = generate_keypair();
        let ct1 = encrypt_for_recipient("same", &pub_key).unwrap();
        let ct2 = encrypt_for_recipient("same", &pub_key).unwrap();
        assert_ne!(ct1, ct2, "ephemeral keys should produce different ciphertexts");
    }

    #[test]
    fn test_encrypt_invalid_public_key() {
        let result = encrypt_for_recipient("val", "not-valid-base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_ciphertext_too_short() {
        let (priv_b64, _) = generate_keypair();
        let short = B64.encode(&[0u8; 10]);
        let result = decrypt_with_private_key(&short, &priv_b64);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too short"));
    }

    // ── lock file read / write ────────────────────────────────

    #[test]
    fn test_write_and_read_lock_file_round_trip() {
        let dir = TempDir::new().unwrap();
        let p = dir.path().to_str().unwrap();

        let mut variables = HashMap::new();
        let mut inner = HashMap::new();
        inner.insert("alice".to_string(), "encrypted_val".to_string());
        variables.insert("API_KEY".to_string(), inner);

        let lock = LockFile {
            version: 1,
            members: vec![TeamMember {
                name: "alice".to_string(),
                public_key: "AAAA".to_string(),
            }],
            variables,
            profile: "production".to_string(),
        };

        write_lock_file(p, &lock).unwrap();
        let read_back = read_lock_file(p).unwrap();

        assert_eq!(read_back.version, 1);
        assert_eq!(read_back.profile, "production");
        assert_eq!(read_back.members.len(), 1);
        assert_eq!(read_back.members[0].name, "alice");
        assert!(read_back.variables.contains_key("API_KEY"));
    }

    #[test]
    fn test_read_lock_file_not_found() {
        let dir = TempDir::new().unwrap();
        let result = read_lock_file(dir.path().to_str().unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn test_lock_file_serialization_contains_expected_fields() {
        let lock = LockFile {
            version: 2,
            members: vec![],
            variables: HashMap::new(),
            profile: "dev".to_string(),
        };
        let json = serde_json::to_string(&lock).unwrap();
        assert!(json.contains("\"version\":2"));
        assert!(json.contains("\"profile\":\"dev\""));
        assert!(json.contains("\"members\":[]"));
    }
}
