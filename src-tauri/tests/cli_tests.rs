//! Integration tests for Stash CLI library functions.
//!
//! These tests exercise the shared library modules (`env_parser`, `profile_manager`,
//! `team`, `vault`) that underpin the `stash-cli` binary. Each test uses a temporary
//! directory for full isolation.

use std::collections::HashMap;
use tempfile::TempDir;

use stash_lib::env_parser;
use stash_lib::profile_manager;
use stash_lib::state::EnvVar;
use stash_lib::team;
use stash_lib::vault;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn make_var(key: &str, value: &str) -> EnvVar {
    EnvVar {
        key: key.to_string(),
        value: value.to_string(),
    }
}

/// Write a .env file into `dir` with the given content and return its path as a String.
fn write_env(dir: &std::path::Path, filename: &str, content: &str) -> String {
    let path = dir.join(filename);
    std::fs::write(&path, content).unwrap();
    path.to_string_lossy().to_string()
}

// ===========================================================================
// 1. env_parser tests
// ===========================================================================

#[test]
fn env_parse_basic_key_value_pairs() {
    let vars = env_parser::parse_env("DATABASE_URL=postgres://localhost/mydb\nPORT=3000");
    assert_eq!(vars.len(), 2);
    assert_eq!(vars[0].key, "DATABASE_URL");
    assert_eq!(vars[0].value, "postgres://localhost/mydb");
    assert_eq!(vars[1].key, "PORT");
    assert_eq!(vars[1].value, "3000");
}

#[test]
fn env_parse_double_quoted_values() {
    let vars = env_parser::parse_env("SECRET=\"my secret value\"");
    assert_eq!(vars.len(), 1);
    assert_eq!(vars[0].key, "SECRET");
    assert_eq!(vars[0].value, "my secret value");
}

#[test]
fn env_parse_single_quoted_values() {
    let vars = env_parser::parse_env("TOKEN='abc 123'");
    assert_eq!(vars.len(), 1);
    assert_eq!(vars[0].value, "abc 123");
}

#[test]
fn env_parse_comments_and_blank_lines_skipped() {
    let input = "# Database config\n\nDB_HOST=localhost\n\n# Port\nDB_PORT=5432\n  \n";
    let vars = env_parser::parse_env(input);
    assert_eq!(vars.len(), 2);
    assert_eq!(vars[0].key, "DB_HOST");
    assert_eq!(vars[1].key, "DB_PORT");
}

#[test]
fn env_parse_empty_value() {
    let vars = env_parser::parse_env("EMPTY_KEY=");
    assert_eq!(vars.len(), 1);
    assert_eq!(vars[0].key, "EMPTY_KEY");
    assert_eq!(vars[0].value, "");
}

#[test]
fn env_read_write_roundtrip() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join(".env");
    let path_str = path.to_string_lossy().to_string();

    let original = vec![
        make_var("API_KEY", "sk-12345"),
        make_var("DB_URL", "postgres://u:p@host/db"),
        make_var("GREETING", "hello world"),
        make_var("EMPTY", ""),
    ];

    env_parser::write_env_file(&path_str, &original).unwrap();
    let parsed = env_parser::read_env_file(&path_str).unwrap();

    assert_eq!(parsed.len(), original.len());
    for (orig, read) in original.iter().zip(parsed.iter()) {
        assert_eq!(orig.key, read.key, "key mismatch");
        assert_eq!(orig.value, read.value, "value mismatch for {}", orig.key);
    }
}

#[test]
fn env_add_variable_to_existing_file() {
    let dir = TempDir::new().unwrap();
    let path_str = write_env(&dir.path(), ".env", "EXISTING=yes\n");

    env_parser::add_var_to_file(&path_str, "NEW_VAR", "new_value").unwrap();

    let vars = env_parser::read_env_file(&path_str).unwrap();
    assert_eq!(vars.len(), 2);
    assert_eq!(vars[1].key, "NEW_VAR");
    assert_eq!(vars[1].value, "new_value");
}

#[test]
fn env_remove_variable_from_file() {
    let dir = TempDir::new().unwrap();
    let path_str = write_env(&dir.path(), ".env", "KEEP=1\nDELETE_ME=2\nALSO_KEEP=3\n");

    env_parser::remove_var_from_file(&path_str, "DELETE_ME").unwrap();

    let vars = env_parser::read_env_file(&path_str).unwrap();
    assert_eq!(vars.len(), 2);
    let keys: Vec<&str> = vars.iter().map(|v| v.key.as_str()).collect();
    assert!(keys.contains(&"KEEP"));
    assert!(keys.contains(&"ALSO_KEEP"));
    assert!(!keys.contains(&"DELETE_ME"));
}

#[test]
fn env_update_existing_variable() {
    let dir = TempDir::new().unwrap();
    let path_str = write_env(&dir.path(), ".env", "A=old\nB=unchanged\n");

    env_parser::update_var_in_file(&path_str, "A", "new_value").unwrap();

    let vars = env_parser::read_env_file(&path_str).unwrap();
    let a = vars.iter().find(|v| v.key == "A").expect("A should exist");
    assert_eq!(a.value, "new_value");
    let b = vars.iter().find(|v| v.key == "B").expect("B should exist");
    assert_eq!(b.value, "unchanged");
}

// ===========================================================================
// 2. profile_manager tests
// ===========================================================================

#[test]
fn profile_list_returns_empty_when_no_env_files() {
    let dir = TempDir::new().unwrap();
    let profiles = profile_manager::list_profiles(dir.path().to_str().unwrap());
    assert!(profiles.is_empty());
}

#[test]
fn profile_list_finds_env_profile_files() {
    let dir = TempDir::new().unwrap();
    let p = dir.path();
    std::fs::write(p.join(".env.development"), "DEV=1").unwrap();
    std::fs::write(p.join(".env.staging"), "STAGE=1").unwrap();
    std::fs::write(p.join(".env.production"), "PROD=1").unwrap();
    // These should be excluded by the filter
    std::fs::write(p.join(".env.example"), "").unwrap();
    std::fs::write(p.join(".env.template"), "").unwrap();
    std::fs::write(p.join("unrelated.txt"), "").unwrap();

    let profiles = profile_manager::list_profiles(p.to_str().unwrap());
    assert_eq!(profiles.len(), 3);
    assert!(profiles.contains(&"development".to_string()));
    assert!(profiles.contains(&"staging".to_string()));
    assert!(profiles.contains(&"production".to_string()));
}

#[test]
fn profile_get_active_returns_default_when_no_state() {
    let dir = TempDir::new().unwrap();
    let active = profile_manager::get_active_profile(dir.path().to_str().unwrap());
    assert_eq!(active, "default");
}

#[cfg(unix)]
#[test]
fn profile_switch_creates_symlink_and_reports_active() {
    let dir = TempDir::new().unwrap();
    let p = dir.path();
    std::fs::write(p.join(".env"), "DEFAULT=1").unwrap();
    std::fs::write(p.join(".env.staging"), "STAGE=1").unwrap();

    profile_manager::switch_profile(p.to_str().unwrap(), "staging").unwrap();

    // .env should now be a symlink
    let meta = std::fs::symlink_metadata(p.join(".env")).unwrap();
    assert!(meta.file_type().is_symlink());
    assert_eq!(
        profile_manager::get_active_profile(p.to_str().unwrap()),
        "staging"
    );
    // Original .env content should be saved as .env.default
    assert!(p.join(".env.default").exists());
}

#[test]
fn profile_create_from_scratch() {
    let dir = TempDir::new().unwrap();
    let p = dir.path();

    profile_manager::create_profile(p.to_str().unwrap(), "test", None).unwrap();

    let created = p.join(".env.test");
    assert!(created.exists());
    let content = std::fs::read_to_string(&created).unwrap();
    assert!(content.is_empty(), "new profile from scratch should be empty");
}

#[test]
fn profile_create_cloned_from_existing() {
    let dir = TempDir::new().unwrap();
    let p = dir.path();
    std::fs::write(p.join(".env.source"), "API_KEY=abc\nDEBUG=true\n").unwrap();

    profile_manager::create_profile(p.to_str().unwrap(), "clone", Some("source")).unwrap();

    let content = std::fs::read_to_string(p.join(".env.clone")).unwrap();
    assert!(content.contains("API_KEY=abc"));
    assert!(content.contains("DEBUG=true"));
}

// ===========================================================================
// 3. team / crypto tests
// ===========================================================================

#[test]
fn team_generate_keypair_returns_valid_base64() {
    let (private_b64, public_b64) = team::generate_keypair();

    let private_bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &private_b64,
    )
    .expect("private key should be valid base64");
    let public_bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &public_b64,
    )
    .expect("public key should be valid base64");

    assert_eq!(private_bytes.len(), 32, "X25519 private key is 32 bytes");
    assert_eq!(public_bytes.len(), 32, "X25519 public key is 32 bytes");
}

#[test]
fn team_encrypt_then_decrypt_roundtrip() {
    let (private_b64, public_b64) = team::generate_keypair();
    let plaintext = "sk_live_51HG3j2eZv_very_secret_stripe_key";

    let encrypted = team::encrypt_for_recipient(plaintext, &public_b64).unwrap();
    // Ciphertext should be base64 and different from plaintext
    assert_ne!(encrypted, plaintext);

    let decrypted = team::decrypt_with_private_key(&encrypted, &private_b64).unwrap();
    assert_eq!(decrypted, plaintext);
}

#[test]
fn team_encrypt_for_one_key_cannot_decrypt_with_different_key() {
    let (_priv_alice, pub_alice) = team::generate_keypair();
    let (priv_bob, _pub_bob) = team::generate_keypair();

    let encrypted = team::encrypt_for_recipient("secret-for-alice", &pub_alice).unwrap();
    let result = team::decrypt_with_private_key(&encrypted, &priv_bob);

    assert!(result.is_err(), "Bob should not be able to decrypt Alice's message");
}

#[test]
fn team_write_and_read_lock_file_roundtrip() {
    let dir = TempDir::new().unwrap();
    let dir_str = dir.path().to_str().unwrap();

    let mut variables = HashMap::new();
    let mut api_key_map = HashMap::new();
    api_key_map.insert("alice".to_string(), "encrypted_aaa".to_string());
    api_key_map.insert("bob".to_string(), "encrypted_bbb".to_string());
    variables.insert("API_KEY".to_string(), api_key_map);

    let lock = team::LockFile {
        version: 1,
        members: vec![
            team::TeamMember {
                name: "alice".to_string(),
                public_key: "alice_pub_key".to_string(),
            },
            team::TeamMember {
                name: "bob".to_string(),
                public_key: "bob_pub_key".to_string(),
            },
        ],
        variables,
        profile: "production".to_string(),
    };

    team::write_lock_file(dir_str, &lock).unwrap();
    let read_back = team::read_lock_file(dir_str).unwrap();

    assert_eq!(read_back.version, 1);
    assert_eq!(read_back.profile, "production");
    assert_eq!(read_back.members.len(), 2);
    assert_eq!(read_back.members[0].name, "alice");
    assert_eq!(read_back.members[1].name, "bob");
    assert!(read_back.variables.contains_key("API_KEY"));
    let api_map = read_back.variables.get("API_KEY").unwrap();
    assert_eq!(api_map.get("alice").unwrap(), "encrypted_aaa");
    assert_eq!(api_map.get("bob").unwrap(), "encrypted_bbb");
}

#[test]
fn team_lock_file_with_multiple_members_and_variables() {
    let dir = TempDir::new().unwrap();
    let dir_str = dir.path().to_str().unwrap();

    // Generate real keypairs for three members
    let (priv_a, pub_a) = team::generate_keypair();
    let (priv_b, pub_b) = team::generate_keypair();
    let (_priv_c, pub_c) = team::generate_keypair();

    let members = vec![
        team::TeamMember { name: "alice".to_string(), public_key: pub_a.clone() },
        team::TeamMember { name: "bob".to_string(), public_key: pub_b.clone() },
        team::TeamMember { name: "carol".to_string(), public_key: pub_c.clone() },
    ];

    // Encrypt two variables for all three members
    let vars_to_encrypt = vec![
        ("DATABASE_URL", "postgres://prod:secret@db.example.com/app"),
        ("REDIS_URL", "redis://:authpass@cache.example.com:6379"),
    ];

    let mut variables: HashMap<String, HashMap<String, String>> = HashMap::new();
    for (key, value) in &vars_to_encrypt {
        let mut member_map = HashMap::new();
        for member in &members {
            let encrypted = team::encrypt_for_recipient(value, &member.public_key).unwrap();
            member_map.insert(member.name.clone(), encrypted);
        }
        variables.insert(key.to_string(), member_map);
    }

    let lock = team::LockFile {
        version: 1,
        members: members.clone(),
        variables,
        profile: "production".to_string(),
    };

    team::write_lock_file(dir_str, &lock).unwrap();
    let read_back = team::read_lock_file(dir_str).unwrap();

    // Alice can decrypt her values
    let alice_db = read_back.variables.get("DATABASE_URL").unwrap().get("alice").unwrap();
    let decrypted = team::decrypt_with_private_key(alice_db, &priv_a).unwrap();
    assert_eq!(decrypted, "postgres://prod:secret@db.example.com/app");

    // Bob can decrypt his values
    let bob_redis = read_back.variables.get("REDIS_URL").unwrap().get("bob").unwrap();
    let decrypted = team::decrypt_with_private_key(bob_redis, &priv_b).unwrap();
    assert_eq!(decrypted, "redis://:authpass@cache.example.com:6379");

    assert_eq!(read_back.members.len(), 3);
    assert_eq!(read_back.variables.len(), 2);
}

// ===========================================================================
// 4. vault tests
// ===========================================================================

#[test]
fn vault_not_initialized_returns_false() {
    let dir = TempDir::new().unwrap();
    assert!(
        !vault::is_vault_initialized(dir.path().to_str().unwrap()),
        "empty directory should not be considered an initialized vault"
    );
}

#[test]
fn vault_init_creates_files() {
    let dir = TempDir::new().unwrap();
    let stash_dir = dir.path().to_str().unwrap();

    let key = vault::init_vault("strong-password-123", stash_dir).unwrap();
    assert_eq!(key.len(), 32, "derived key should be 32 bytes");

    assert!(
        dir.path().join("salt").exists(),
        "salt file should be created"
    );
    assert!(
        dir.path().join("vault.enc").exists(),
        "vault.enc file should be created"
    );
    assert!(
        vault::is_vault_initialized(stash_dir),
        "vault should report as initialized after init"
    );
}

#[test]
fn vault_unlock_with_correct_password() {
    let dir = TempDir::new().unwrap();
    let stash_dir = dir.path().to_str().unwrap();
    let password = "my-vault-master-password";

    let init_key = vault::init_vault(password, stash_dir).unwrap();
    let unlock_key = vault::unlock_vault(password, stash_dir).unwrap();

    assert_eq!(
        init_key, unlock_key,
        "init and unlock with same password should derive the same key"
    );
}

#[test]
fn vault_unlock_with_wrong_password_fails() {
    let dir = TempDir::new().unwrap();
    let stash_dir = dir.path().to_str().unwrap();

    vault::init_vault("correct-password", stash_dir).unwrap();
    let result = vault::unlock_vault("wrong-password", stash_dir);

    assert!(result.is_err(), "wrong password should fail to unlock");
    assert!(
        result.unwrap_err().contains("Incorrect password"),
        "error message should indicate incorrect password"
    );
}

// ===========================================================================
// 5. export format tests
// ===========================================================================
//
// These tests replicate the formatting logic from `cmd_export` in stash-cli
// to verify that each output format is generated correctly from a set of
// EnvVar values.

/// Reproduce the JSON export logic from cmd_export.
fn format_json(vars: &[EnvVar]) -> String {
    let map: serde_json::Map<String, serde_json::Value> = vars
        .iter()
        .map(|v| (v.key.clone(), serde_json::Value::String(v.value.clone())))
        .collect();
    serde_json::to_string_pretty(&map).unwrap()
}

/// Reproduce the YAML export logic from cmd_export.
fn format_yaml(vars: &[EnvVar]) -> String {
    vars.iter()
        .map(|v| format!("{}: \"{}\"", v.key, v.value.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Reproduce the Docker --env-file export logic from cmd_export.
fn format_docker(vars: &[EnvVar]) -> String {
    vars.iter()
        .map(|v| format!("{}={}", v.key, v.value))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Reproduce the GitHub Actions export logic from cmd_export.
fn format_github(vars: &[EnvVar]) -> String {
    vars.iter()
        .map(|v| {
            format!(
                "gh secret set {} --body \"{}\"",
                v.key,
                v.value.replace('"', "\\\"")
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn sample_vars() -> Vec<EnvVar> {
    vec![
        make_var("API_KEY", "sk-12345"),
        make_var("DATABASE_URL", "postgres://user:pass@localhost/db"),
        make_var("DEBUG", "true"),
    ]
}

#[test]
fn export_json_format() {
    let vars = sample_vars();
    let json = format_json(&vars);

    let parsed: serde_json::Value = serde_json::from_str(&json).expect("output should be valid JSON");
    let obj = parsed.as_object().expect("top level should be an object");

    assert_eq!(obj.get("API_KEY").unwrap().as_str().unwrap(), "sk-12345");
    assert_eq!(
        obj.get("DATABASE_URL").unwrap().as_str().unwrap(),
        "postgres://user:pass@localhost/db"
    );
    assert_eq!(obj.get("DEBUG").unwrap().as_str().unwrap(), "true");
    assert_eq!(obj.len(), 3);
}

#[test]
fn export_yaml_format() {
    let vars = sample_vars();
    let yaml = format_yaml(&vars);

    let lines: Vec<&str> = yaml.lines().collect();
    assert_eq!(lines.len(), 3);
    assert_eq!(lines[0], "API_KEY: \"sk-12345\"");
    assert_eq!(
        lines[1],
        "DATABASE_URL: \"postgres://user:pass@localhost/db\""
    );
    assert_eq!(lines[2], "DEBUG: \"true\"");
}

#[test]
fn export_docker_format() {
    let vars = sample_vars();
    let docker = format_docker(&vars);

    let lines: Vec<&str> = docker.lines().collect();
    assert_eq!(lines.len(), 3);
    // Docker format is plain KEY=VALUE with no quoting
    assert_eq!(lines[0], "API_KEY=sk-12345");
    assert_eq!(lines[1], "DATABASE_URL=postgres://user:pass@localhost/db");
    assert_eq!(lines[2], "DEBUG=true");
}

#[test]
fn export_github_actions_format() {
    let vars = sample_vars();
    let github = format_github(&vars);

    let lines: Vec<&str> = github.lines().collect();
    assert_eq!(lines.len(), 3);
    assert_eq!(lines[0], "gh secret set API_KEY --body \"sk-12345\"");
    assert_eq!(
        lines[1],
        "gh secret set DATABASE_URL --body \"postgres://user:pass@localhost/db\""
    );
    assert_eq!(lines[2], "gh secret set DEBUG --body \"true\"");
}

#[test]
fn export_yaml_escapes_double_quotes_in_values() {
    let vars = vec![make_var("MSG", "say \"hello\" world")];
    let yaml = format_yaml(&vars);
    assert_eq!(yaml, "MSG: \"say \\\"hello\\\" world\"");
}

#[test]
fn export_github_escapes_double_quotes_in_values() {
    let vars = vec![make_var("TOKEN", "has\"quote")];
    let github = format_github(&vars);
    assert_eq!(github, "gh secret set TOKEN --body \"has\\\"quote\"");
}

// ===========================================================================
// Integration: end-to-end workflow combining multiple modules
// ===========================================================================

#[test]
fn workflow_create_profile_add_vars_switch_and_verify() {
    let dir = TempDir::new().unwrap();
    let p = dir.path();
    let dir_str = p.to_str().unwrap();

    // Create two profiles
    profile_manager::create_profile(dir_str, "development", None).unwrap();
    profile_manager::create_profile(dir_str, "staging", None).unwrap();

    // Add variables to the development profile
    let dev_path = p.join(".env.development").to_string_lossy().to_string();
    env_parser::add_var_to_file(&dev_path, "API_URL", "http://localhost:3000").unwrap();
    env_parser::add_var_to_file(&dev_path, "DEBUG", "true").unwrap();

    // Add variables to the staging profile
    let staging_path = p.join(".env.staging").to_string_lossy().to_string();
    env_parser::add_var_to_file(&staging_path, "API_URL", "https://staging.example.com").unwrap();
    env_parser::add_var_to_file(&staging_path, "DEBUG", "false").unwrap();

    // Verify profiles are listed
    let profiles = profile_manager::list_profiles(dir_str);
    assert!(profiles.contains(&"development".to_string()));
    assert!(profiles.contains(&"staging".to_string()));

    // Read back and verify each profile has its own values
    let dev_vars = env_parser::read_env_file(&dev_path).unwrap();
    assert_eq!(dev_vars.len(), 2);
    assert_eq!(
        dev_vars.iter().find(|v| v.key == "API_URL").unwrap().value,
        "http://localhost:3000"
    );

    let staging_vars = env_parser::read_env_file(&staging_path).unwrap();
    assert_eq!(staging_vars.len(), 2);
    assert_eq!(
        staging_vars.iter().find(|v| v.key == "API_URL").unwrap().value,
        "https://staging.example.com"
    );
}

#[test]
fn workflow_encrypt_vars_write_lock_decrypt_for_each_member() {
    let dir = TempDir::new().unwrap();
    let dir_str = dir.path().to_str().unwrap();

    let (priv_a, pub_a) = team::generate_keypair();
    let (priv_b, pub_b) = team::generate_keypair();

    let members = vec![
        team::TeamMember { name: "alice".to_string(), public_key: pub_a.clone() },
        team::TeamMember { name: "bob".to_string(), public_key: pub_b.clone() },
    ];

    let secrets = vec![
        ("STRIPE_KEY", "sk_live_abc123"),
        ("JWT_SECRET", "super-long-random-jwt-secret-string"),
    ];

    let mut variables: HashMap<String, HashMap<String, String>> = HashMap::new();
    for (key, value) in &secrets {
        let mut per_member = HashMap::new();
        for member in &members {
            let enc = team::encrypt_for_recipient(value, &member.public_key).unwrap();
            per_member.insert(member.name.clone(), enc);
        }
        variables.insert(key.to_string(), per_member);
    }

    let lock = team::LockFile {
        version: 1,
        members,
        variables,
        profile: "default".to_string(),
    };

    team::write_lock_file(dir_str, &lock).unwrap();
    let loaded = team::read_lock_file(dir_str).unwrap();

    // Each member can decrypt their own copy of each variable
    for (key, value) in &secrets {
        let alice_enc = loaded.variables.get(*key).unwrap().get("alice").unwrap();
        assert_eq!(team::decrypt_with_private_key(alice_enc, &priv_a).unwrap(), *value);

        let bob_enc = loaded.variables.get(*key).unwrap().get("bob").unwrap();
        assert_eq!(team::decrypt_with_private_key(bob_enc, &priv_b).unwrap(), *value);
    }

    // But Alice cannot decrypt Bob's ciphertext
    let bob_stripe = loaded.variables.get("STRIPE_KEY").unwrap().get("bob").unwrap();
    assert!(
        team::decrypt_with_private_key(bob_stripe, &priv_a).is_err(),
        "Alice should not decrypt Bob's ciphertext"
    );
}
