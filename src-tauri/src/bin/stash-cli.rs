use clap::{Parser, Subcommand};
use std::collections::HashMap;
use std::path::Path;

// Import shared modules from the library crate
use stash_lib::{env_parser, profile_manager, vault, team, session};

#[derive(Parser)]
#[command(name = "stash", version, about = "Environment variable vault CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Decrypt .stash.lock and write to .env
    Pull,
    /// Encrypt .env and write to .stash.lock
    Push,
    /// Switch to a named profile
    Switch {
        /// Profile name (e.g., development, staging, production)
        profile: String,
    },
    /// List profiles for the current project
    List,
    /// Initialize .stash.lock in the current directory
    Init,
    /// Show which vars are set, missing, or stale
    Status,
    /// Compare two profiles side-by-side
    Diff {
        /// Left profile name
        left: String,
        /// Right profile name
        right: String,
    },
    /// Generate or show your keypair
    Keys {
        #[command(subcommand)]
        action: Option<KeysAction>,
    },
    /// Add a variable to the current .env
    Add {
        key: String,
        value: Option<String>,
    },
    /// Remove a variable from the current .env
    Remove {
        key: String,
    },
    /// Run a command with env vars injected
    Run {
        /// Profile to use (defaults to active)
        #[arg(long)]
        profile: Option<String>,
        /// Command and arguments (after --)
        #[arg(trailing_var_arg = true, required = true)]
        command: Vec<String>,
    },
    /// Export env vars in different formats
    Export {
        /// Output format: env (default), json, yaml, docker, github
        #[arg(long, short, default_value = "env")]
        format: String,
        /// Profile to use (defaults to active)
        #[arg(long)]
        profile: Option<String>,
        /// Output file (defaults to stdout)
        #[arg(long, short)]
        output: Option<String>,
    },
}

#[derive(Subcommand)]
enum KeysAction {
    /// Generate a new Ed25519 keypair
    Generate,
    /// Show your public key
    Show,
}

fn stash_dir() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".stash").to_string_lossy().to_string()
}

fn ensure_auth() -> Result<(), String> {
    // Try session token first
    if session::read_session().is_some() {
        return Ok(());
    }

    // Fall back to password
    let dir = stash_dir();
    if !vault::is_vault_initialized(&dir) {
        return Err("No vault found. Run the Stash app first to create a vault.".to_string());
    }

    eprint!("Master password: ");
    let password = rpassword_fallback();
    vault::unlock_vault(&password, &dir)?;
    Ok(())
}

fn rpassword_fallback() -> String {
    // Simple password read from stdin (no echo hiding in this basic version)
    let mut input = String::new();
    std::io::stdin().read_line(&mut input).unwrap_or_default();
    input.trim().to_string()
}

fn current_dir() -> String {
    std::env::current_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Pull => cmd_pull(),
        Commands::Push => cmd_push(),
        Commands::Switch { profile } => cmd_switch(&profile),
        Commands::List => cmd_list(),
        Commands::Init => cmd_init(),
        Commands::Status => cmd_status(),
        Commands::Diff { left, right } => cmd_diff(&left, &right),
        Commands::Keys { action } => cmd_keys(action),
        Commands::Add { key, value } => cmd_add(&key, value.as_deref()),
        Commands::Remove { key } => cmd_remove(&key),
        Commands::Run { profile, command } => cmd_run(profile.as_deref(), &command),
        Commands::Export { format, profile, output } => cmd_export(&format, profile.as_deref(), output.as_deref()),
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

fn cmd_pull() -> Result<(), String> {
    ensure_auth()?;
    let dir = current_dir();
    let lock = team::read_lock_file(&dir)?;
    let stash = stash_dir();

    let key_path = format!("{}/keypair.json", stash);
    let content = std::fs::read_to_string(&key_path)
        .map_err(|_| "No keypair found. Run `stash keys generate` first.".to_string())?;
    let keypair: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let private_key = keypair["private"].as_str().ok_or("Invalid keypair")?;
    let public_key = keypair["public"].as_str().ok_or("Invalid keypair")?;

    let my_name = lock.members.iter()
        .find(|m| m.public_key == public_key)
        .map(|m| m.name.clone())
        .ok_or("You are not a member of this .stash.lock")?;

    let mut vars = Vec::new();
    for (key, encrypted_map) in &lock.variables {
        if let Some(encrypted) = encrypted_map.get(&my_name) {
            match team::decrypt_with_private_key(encrypted, private_key) {
                Ok(value) => vars.push((key.clone(), value)),
                Err(e) => eprintln!("  Warning: failed to decrypt {}: {}", key, e),
            }
        }
    }

    let env_path = Path::new(&dir).join(".env");
    let content = vars.iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&env_path, &content).map_err(|e| format!("Failed to write .env: {}", e))?;

    println!("Pulled {} variables from .stash.lock", vars.len());
    Ok(())
}

fn cmd_push() -> Result<(), String> {
    ensure_auth()?;
    let dir = current_dir();
    let env_path = Path::new(&dir).join(".env");

    if !env_path.exists() {
        return Err("No .env file in current directory".to_string());
    }

    let vars = env_parser::read_env_file(&env_path.to_string_lossy())?;
    let mut lock = team::read_lock_file(&dir).unwrap_or(team::LockFile {
        version: 1,
        members: Vec::new(),
        variables: HashMap::new(),
        profile: "default".to_string(),
    });

    let stash = stash_dir();
    let key_path = format!("{}/keypair.json", stash);
    let content = std::fs::read_to_string(&key_path)
        .map_err(|_| "No keypair. Run `stash keys generate`".to_string())?;
    let keypair: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let public_key = keypair["public"].as_str().ok_or("Invalid keypair")?;

    if !lock.members.iter().any(|m| m.public_key == public_key) {
        lock.members.push(team::TeamMember {
            name: whoami().unwrap_or_else(|| "Me".to_string()),
            public_key: public_key.to_string(),
        });
    }

    lock.variables.clear();
    for var in &vars {
        let mut encrypted_map = HashMap::new();
        for member in &lock.members {
            let encrypted = team::encrypt_for_recipient(&var.value, &member.public_key)?;
            encrypted_map.insert(member.name.clone(), encrypted);
        }
        lock.variables.insert(var.key.clone(), encrypted_map);
    }

    team::write_lock_file(&dir, &lock)?;
    println!("Pushed {} variables for {} members", vars.len(), lock.members.len());
    Ok(())
}

fn cmd_switch(profile: &str) -> Result<(), String> {
    let dir = current_dir();
    profile_manager::switch_profile(&dir, profile)?;
    println!("Switched to profile: {}", profile);
    Ok(())
}

fn cmd_list() -> Result<(), String> {
    let dir = current_dir();
    let profiles = profile_manager::list_profiles(&dir);
    let active = profile_manager::get_active_profile(&dir);

    if profiles.is_empty() {
        println!("No profiles found. Only .env exists.");
    } else {
        println!("Profiles:");
        for p in &profiles {
            let marker = if p == &active { " (active)" } else { "" };
            println!("  {}{}", p, marker);
        }
    }
    Ok(())
}

fn cmd_init() -> Result<(), String> {
    let dir = current_dir();
    let lock_path = Path::new(&dir).join(".stash.lock");

    if lock_path.exists() {
        return Err(".stash.lock already exists".to_string());
    }

    let stash = stash_dir();
    let key_path = format!("{}/keypair.json", stash);
    if !Path::new(&key_path).exists() {
        println!("Generating keypair...");
        let (priv_b64, pub_b64) = team::generate_keypair();
        let keypair = serde_json::json!({ "private": priv_b64, "public": pub_b64 });
        std::fs::create_dir_all(&stash).ok();
        std::fs::write(&key_path, serde_json::to_string_pretty(&keypair).unwrap())
            .map_err(|e| format!("Failed to save keypair: {}", e))?;
    }

    let content = std::fs::read_to_string(&key_path).map_err(|e| e.to_string())?;
    let keypair: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let public_key = keypair["public"].as_str().ok_or("Invalid keypair")?;

    let lock = team::LockFile {
        version: 1,
        members: vec![team::TeamMember {
            name: whoami().unwrap_or_else(|| "Me".to_string()),
            public_key: public_key.to_string(),
        }],
        variables: HashMap::new(),
        profile: "default".to_string(),
    };

    team::write_lock_file(&dir, &lock)?;
    println!("Initialized .stash.lock");
    println!("Your public key: {}", public_key);
    Ok(())
}

fn cmd_status() -> Result<(), String> {
    let dir = current_dir();
    let env_path = Path::new(&dir).join(".env");

    if !env_path.exists() {
        println!("No .env file found.");
        return Ok(());
    }

    let vars = env_parser::read_env_file(&env_path.to_string_lossy())?;
    let active = profile_manager::get_active_profile(&dir);

    println!("Profile: {}", active);
    println!("Variables: {}", vars.len());

    let empty: Vec<_> = vars.iter().filter(|v| v.value.is_empty()).collect();
    let set: Vec<_> = vars.iter().filter(|v| !v.value.is_empty()).collect();

    println!("  {} set, {} empty", set.len(), empty.len());

    if !empty.is_empty() {
        println!("\nMissing values:");
        for v in &empty {
            println!("  {} (empty)", v.key);
        }
    }

    Ok(())
}

fn cmd_diff(left: &str, right: &str) -> Result<(), String> {
    let dir = current_dir();

    let left_path = Path::new(&dir).join(format!(".env.{}", left));
    let right_path = Path::new(&dir).join(format!(".env.{}", right));

    let left_vars: HashMap<String, String> = if left_path.exists() {
        env_parser::read_env_file(&left_path.to_string_lossy())?
            .into_iter().map(|v| (v.key, v.value)).collect()
    } else {
        return Err(format!(".env.{} not found", left));
    };

    let right_vars: HashMap<String, String> = if right_path.exists() {
        env_parser::read_env_file(&right_path.to_string_lossy())?
            .into_iter().map(|v| (v.key, v.value)).collect()
    } else {
        return Err(format!(".env.{} not found", right));
    };

    let mut all_keys: Vec<String> = left_vars.keys().chain(right_vars.keys())
        .cloned().collect::<std::collections::HashSet<_>>()
        .into_iter().collect();
    all_keys.sort();

    println!("{:<30} {:<20} {:<20}", "KEY", left, right);
    println!("{}", "-".repeat(70));

    for key in &all_keys {
        let l = left_vars.get(key).map(|s| s.as_str()).unwrap_or("(missing)");
        let r = right_vars.get(key).map(|s| s.as_str()).unwrap_or("(missing)");
        if l != r {
            println!("{:<30} {:<20} {:<20} ←", key, truncate(l, 18), truncate(r, 18));
        }
    }

    Ok(())
}

fn cmd_keys(action: Option<KeysAction>) -> Result<(), String> {
    let stash = stash_dir();
    std::fs::create_dir_all(&stash).ok();

    match action {
        Some(KeysAction::Generate) | None => {
            let key_path = format!("{}/keypair.json", stash);
            if Path::new(&key_path).exists() {
                let content = std::fs::read_to_string(&key_path).map_err(|e| e.to_string())?;
                let keypair: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
                println!("Keypair already exists.");
                println!("Public key: {}", keypair["public"].as_str().unwrap_or("?"));
                return Ok(());
            }

            let (priv_b64, pub_b64) = team::generate_keypair();
            let keypair = serde_json::json!({ "private": priv_b64, "public": pub_b64 });
            std::fs::write(&key_path, serde_json::to_string_pretty(&keypair).unwrap())
                .map_err(|e| format!("Failed to save: {}", e))?;
            println!("Generated keypair.");
            println!("Public key: {}", pub_b64);
            println!("Share this key with your team members.");
        }
        Some(KeysAction::Show) => {
            let key_path = format!("{}/keypair.json", stash);
            if !Path::new(&key_path).exists() {
                return Err("No keypair. Run `stash keys generate`.".to_string());
            }
            let content = std::fs::read_to_string(&key_path).map_err(|e| e.to_string())?;
            let keypair: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            println!("{}", keypair["public"].as_str().unwrap_or("?"));
        }
    }

    Ok(())
}

fn cmd_add(key: &str, value: Option<&str>) -> Result<(), String> {
    let dir = current_dir();
    let env_path = Path::new(&dir).join(".env");
    env_parser::add_var_to_file(&env_path.to_string_lossy(), key, value.unwrap_or(""))?;
    println!("Added {}", key);
    Ok(())
}

fn cmd_remove(key: &str) -> Result<(), String> {
    let dir = current_dir();
    let env_path = Path::new(&dir).join(".env");
    env_parser::remove_var_from_file(&env_path.to_string_lossy(), key)?;
    println!("Removed {}", key);
    Ok(())
}

fn cmd_run(profile: Option<&str>, command: &[String]) -> Result<(), String> {
    if command.is_empty() {
        return Err("No command specified. Usage: stash run -- <command>".to_string());
    }

    let dir = current_dir();

    // Determine which .env file to read
    let env_path = if let Some(prof) = profile {
        Path::new(&dir).join(format!(".env.{}", prof))
    } else {
        Path::new(&dir).join(".env")
    };

    let vars = if env_path.exists() {
        env_parser::read_env_file(&env_path.to_string_lossy())?
    } else {
        Vec::new()
    };

    let mut child = std::process::Command::new(&command[0]);
    if command.len() > 1 {
        child.args(&command[1..]);
    }

    // Inject env vars
    for var in &vars {
        child.env(&var.key, &var.value);
    }

    let status = child
        .status()
        .map_err(|e| format!("Failed to run '{}': {}", command[0], e))?;

    std::process::exit(status.code().unwrap_or(1));
}

fn cmd_export(format: &str, profile: Option<&str>, output: Option<&str>) -> Result<(), String> {
    let dir = current_dir();

    let env_path = if let Some(prof) = profile {
        Path::new(&dir).join(format!(".env.{}", prof))
    } else {
        Path::new(&dir).join(".env")
    };

    if !env_path.exists() {
        return Err(format!("{} not found", env_path.display()));
    }

    let vars = env_parser::read_env_file(&env_path.to_string_lossy())?;

    let content = match format {
        "json" => {
            let map: serde_json::Map<String, serde_json::Value> = vars
                .iter()
                .map(|v| (v.key.clone(), serde_json::Value::String(v.value.clone())))
                .collect();
            serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?
        }
        "yaml" => {
            vars.iter()
                .map(|v| format!("{}: \"{}\"", v.key, v.value.replace('"', "\\\"")))
                .collect::<Vec<_>>()
                .join("\n")
        }
        "docker" => {
            // Docker --env-file format: KEY=VALUE (no quotes)
            vars.iter()
                .map(|v| format!("{}={}", v.key, v.value))
                .collect::<Vec<_>>()
                .join("\n")
        }
        "github" => {
            // GitHub Actions: gh secret set commands
            vars.iter()
                .map(|v| format!("gh secret set {} --body \"{}\"", v.key, v.value.replace('"', "\\\"")))
                .collect::<Vec<_>>()
                .join("\n")
        }
        "env" | _ => {
            // Standard .env format
            vars.iter()
                .map(|v| {
                    if v.value.contains(' ') || v.value.contains('#') {
                        format!("{}=\"{}\"", v.key, v.value.replace('"', "\\\""))
                    } else {
                        format!("{}={}", v.key, v.value)
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
    };

    if let Some(out_path) = output {
        std::fs::write(out_path, &content)
            .map_err(|e| format!("Failed to write {}: {}", out_path, e))?;
        println!("Exported {} variables to {}", vars.len(), out_path);
    } else {
        println!("{}", content);
    }

    Ok(())
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max-3])
    }
}

fn whoami() -> Option<String> {
    std::env::var("USER").ok()
}
