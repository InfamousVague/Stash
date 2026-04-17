//! Stash Daemon — syncs state to relay server and executes watch-triggered profile switches.
//!
//! Runs as a background LaunchAgent. Reads projects from ~/.stash/projects.json,
//! watches .env* files for changes, pushes encrypted state to the relay, and
//! polls for pending actions (profile switches from Apple Watch).

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::{mpsc, Mutex};

// Import shared modules from the library crate
use stash_lib::{env_parser, profile_manager, session, state::Project, team};

const RELAY_URL: &str = "https://stash.mattssoftware.com";
const SYNC_INTERVAL: Duration = Duration::from_secs(60);
const POLL_INTERVAL: Duration = Duration::from_secs(2);
const DEBOUNCE_DELAY: Duration = Duration::from_secs(2);

// ── Data types for relay communication ───────────────────────

#[derive(serde::Serialize)]
struct SyncPayload {
    /// This Mac's stable device ID (used as workspace identifier)
    source_device_id: String,
    projects: Vec<ProjectState>,
}

#[derive(serde::Serialize)]
struct ProjectState {
    id: String,
    name: String,
    path: String,
    framework: Option<String>,
    active_profile: String,
    profiles: Vec<ProfileState>,
    health: Option<HealthState>,
}

#[derive(serde::Serialize)]
struct ProfileState {
    name: String,
    variables: Vec<VariableState>,
}

#[derive(serde::Serialize)]
struct VariableState {
    key: String,
    /// Map of device_id → base64 ciphertext. Each peer device gets its
    /// own encryption of the value (X25519 ECDH + AES-256-GCM).
    encrypted_for: std::collections::HashMap<String, String>,
}

#[derive(serde::Deserialize, Debug, Clone)]
struct PeerDevice {
    device_id: String,
    public_key: String,
    #[allow(dead_code)]
    device_type: String,
}

#[derive(serde::Deserialize)]
struct DeviceKeysResponse {
    devices: Vec<PeerDevice>,
}

#[derive(serde::Serialize)]
struct HealthState {
    stale_count: i64,
    expiring_count: i64,
    exposed_count: i64,
}

#[derive(serde::Deserialize, Debug)]
struct PendingAction {
    id: String,
    action_type: String,
    project_id: String,
    payload: serde_json::Value,
}

// ── Mac device identity (for E2E + workspace support) ──────

#[derive(serde::Serialize, serde::Deserialize)]
struct DaemonIdentity {
    device_id: String,
    private_key: String, // base64 X25519 private key
    public_key: String,  // base64 X25519 public key
}

/// Load or create this Mac's persistent device identity.
/// Stored at ~/.stash/daemon_device.json so the device_id is stable across
/// daemon restarts and represents a single "workspace" on the relay.
fn load_or_create_identity() -> DaemonIdentity {
    let path = stash_dir().join("daemon_device.json");
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(identity) = serde_json::from_str::<DaemonIdentity>(&content) {
                return identity;
            }
        }
    }
    // Generate fresh identity
    let (private_key, public_key) = team::generate_keypair();
    let identity = DaemonIdentity {
        device_id: uuid::Uuid::new_v4().to_string(),
        private_key,
        public_key,
    };
    if let Ok(json) = serde_json::to_string_pretty(&identity) {
        let _ = std::fs::write(&path, json);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
    }
    eprintln!("[stash-daemon] generated new device identity: {}", &identity.device_id[..8]);
    identity
}

/// Read the workspace label from ~/.stash/workspace.txt, falling back to the hostname.
fn read_workspace_label() -> String {
    let path = stash_dir().join("workspace.txt");
    if let Ok(content) = std::fs::read_to_string(&path) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    // Default to macOS hostname (scutil --get ComputerName)
    std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Mac".to_string())
}

// ── Encryption helpers ───────────────────────────────────────

fn read_session_key() -> Option<[u8; 32]> {
    session::read_session()
}

fn encrypt_value(value: &str, key: &[u8; 32]) -> String {
    use aes_gcm::aead::generic_array::GenericArray;
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit};

    let cipher = Aes256Gcm::new(GenericArray::from_slice(key));
    let nonce_bytes: [u8; 12] = rand::random();
    let nonce = GenericArray::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, value.as_bytes())
        .expect("encryption failed");
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &combined)
}

// ── Config helpers ───────────────────────────────────────────

fn stash_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".stash")
}

fn read_relay_token() -> Option<String> {
    let path = stash_dir().join("relay_token");
    std::fs::read_to_string(&path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn load_projects() -> Vec<Project> {
    let path = stash_dir().join("projects.json");
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Load rotation timestamps: `{"proj_id:KEY": unix_timestamp}`
fn load_rotation() -> std::collections::HashMap<String, u64> {
    let path = stash_dir().join("rotation.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Load expiry timestamps: `{"proj_id:KEY": unix_timestamp}`
fn load_expiry() -> std::collections::HashMap<String, u64> {
    let path = stash_dir().join("expiry.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Load git exposure cache (project_id -> count of exposed keys)
fn load_git_exposures() -> std::collections::HashMap<String, i64> {
    let path = stash_dir().join("git_scan_cache.json");
    let raw: serde_json::Value = match std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
    {
        Some(v) => v,
        None => return Default::default(),
    };

    // The cache is { project_id: { exposures: [...] } }
    let mut result = std::collections::HashMap::new();
    if let Some(obj) = raw.as_object() {
        for (pid, entry) in obj {
            if let Some(count) = entry.get("exposures").and_then(|e| e.as_array()).map(|a| a.len() as i64) {
                result.insert(pid.clone(), count);
            }
        }
    }
    result
}

/// Compute per-project health summary (stale, expiring, exposed counts).
fn compute_project_health(
    project: &Project,
    rotation: &std::collections::HashMap<String, u64>,
    expiry: &std::collections::HashMap<String, u64>,
    exposures: &std::collections::HashMap<String, i64>,
    now: u64,
) -> HealthState {
    let env_path = format!("{}/.env", project.path);
    let vars = env_parser::read_env_file(&env_path).unwrap_or_default();

    let mut stale = 0i64;
    let mut expiring = 0i64;

    for var in &vars {
        let composite = format!("{}:{}", project.id, var.key);

        // Stale: not rotated in 30+ days
        if let Some(ts) = rotation.get(&composite) {
            let days = (now.saturating_sub(*ts)) / 86400;
            if days > 30 {
                stale += 1;
            }
        }

        // Expiring: within 7 days or already expired
        if let Some(exp_ts) = expiry.get(&composite) {
            if *exp_ts <= now {
                expiring += 1;
            } else {
                let days_until = (exp_ts - now) / 86400;
                if days_until <= 7 {
                    expiring += 1;
                }
            }
        }
    }

    HealthState {
        stale_count: stale,
        expiring_count: expiring,
        exposed_count: *exposures.get(&project.id).unwrap_or(&0),
    }
}

// ── LAN IP helper ───────────────────────────────────────────

fn get_lan_ip() -> Option<String> {
    local_ip_address::local_ip().ok().map(|ip| ip.to_string())
}

// ── Sync logic ───────────────────────────────────────────────

fn build_sync_payload(projects: &[Project], peers: &[PeerDevice], source_device_id: &str) -> SyncPayload {
    // E2E encryption: for each variable, we encrypt the plaintext value once
    // per peer device using X25519 ECDH + AES-256-GCM (via stash_lib::team).
    // The relay only stores ciphertexts — it cannot decrypt them.
    //
    // If the vault is locked, we don't sync any values at all (the plaintext
    // isn't available to us). Project/profile metadata still syncs so the
    // watch knows what exists.
    let vault_unlocked = read_session_key().is_some();
    let rotation = load_rotation();
    let expiry = load_expiry();
    let exposures = load_git_exposures();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let project_states: Vec<ProjectState> = projects
        .iter()
        .filter(|p| !p.local_only)
        .map(|project| {
            let active_profile = profile_manager::get_active_profile(&project.path);
            let profile_names = profile_manager::list_profiles(&project.path);

            let profile_states: Vec<ProfileState> = profile_names
                .iter()
                .map(|profile_name| {
                    let env_file = if profile_name == "default" {
                        format!("{}/.env", project.path)
                    } else {
                        format!("{}/.env.{}", project.path, profile_name)
                    };

                    let variables: Vec<VariableState> = env_parser::read_env_file(&env_file)
                        .unwrap_or_default()
                        .into_iter()
                        .map(|var| {
                            let mut encrypted_for = std::collections::HashMap::new();
                            if vault_unlocked {
                                // Encrypt for each peer device
                                for peer in peers {
                                    match team::encrypt_for_recipient(&var.value, &peer.public_key) {
                                        Ok(ciphertext) => {
                                            encrypted_for.insert(peer.device_id.clone(), ciphertext);
                                        }
                                        Err(e) => {
                                            eprintln!(
                                                "[stash-daemon] encrypt failed for {}: {}",
                                                peer.device_id, e
                                            );
                                        }
                                    }
                                }
                            }
                            // Sentinel for vault-locked state
                            if !vault_unlocked {
                                encrypted_for.insert("__locked__".to_string(), "vault_locked".to_string());
                            }
                            VariableState {
                                key: var.key,
                                encrypted_for,
                            }
                        })
                        .collect();

                    ProfileState {
                        name: profile_name.clone(),
                        variables,
                    }
                })
                .collect();

            let health = compute_project_health(project, &rotation, &expiry, &exposures, now);

            ProjectState {
                id: project.id.clone(),
                name: project.name.clone(),
                path: project.path.clone(),
                framework: project.framework.clone(),
                active_profile,
                profiles: profile_states,
                health: Some(health),
            }
        })
        .collect();

    SyncPayload {
        source_device_id: source_device_id.to_string(),
        projects: project_states,
    }
}

/// Delete the relay token file — called when we detect auth is no longer valid.
/// This effectively unlinks the Mac without touching any local vault data.
fn clear_relay_token() {
    let path = stash_dir().join("relay_token");
    if path.exists() {
        if let Err(e) = std::fs::remove_file(&path) {
            eprintln!("[stash-daemon] failed to clear relay token: {}", e);
        } else {
            eprintln!("[stash-daemon] cleared relay token (auth invalid)");
        }
    }
}

/// Fetch peer device keys from the relay for E2E encryption.
async fn fetch_peer_keys(client: &reqwest::Client, token: &str) -> Vec<PeerDevice> {
    match client
        .get(format!("{}/auth/device-keys", RELAY_URL))
        .bearer_auth(token)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            match resp.json::<DeviceKeysResponse>().await {
                Ok(body) => body.devices,
                Err(e) => {
                    eprintln!("[stash-daemon] peer-keys parse error: {}", e);
                    Vec::new()
                }
            }
        }
        Ok(resp) => {
            eprintln!("[stash-daemon] peer-keys failed: HTTP {}", resp.status());
            Vec::new()
        }
        Err(e) => {
            eprintln!("[stash-daemon] peer-keys error: {}", e);
            Vec::new()
        }
    }
}

/// Register this Mac's device_key (public key) with the relay. Idempotent.
async fn register_device(
    client: &reqwest::Client,
    token: &str,
    identity: &DaemonIdentity,
    label: &str,
) {
    let body = serde_json::json!({
        "device_id": identity.device_id,
        "public_key": identity.public_key,
        "device_type": "mac",
        "label": label,
        "lan_ip": get_lan_ip(),
        "lan_port": 8445,
    });

    match client
        .post(format!("{}/auth/device-key", RELAY_URL))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            eprintln!(
                "[stash-daemon] registered as device {} ({})",
                &identity.device_id[..8],
                label
            );
        }
        Ok(resp) => {
            eprintln!("[stash-daemon] device registration failed: HTTP {}", resp.status());
        }
        Err(e) => {
            eprintln!("[stash-daemon] device registration error: {}", e);
        }
    }
}

async fn push_sync(
    client: &reqwest::Client,
    token: &str,
    projects: &[Project],
    source_device_id: &str,
) {
    // Fetch fresh peer keys on each sync so new devices get encrypted-for
    // immediately without a daemon restart.
    let all_peers = fetch_peer_keys(client, token).await;
    // Exclude ourselves from the peer list — we already have the plaintext
    let peers: Vec<PeerDevice> = all_peers
        .into_iter()
        .filter(|p| p.device_id != source_device_id)
        .collect();
    let payload = build_sync_payload(projects, &peers, source_device_id);

    match client
        .post(format!("{}/sync", RELAY_URL))
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                eprintln!(
                    "[stash-daemon] sync pushed ({} projects, {} peers)",
                    payload.projects.len(),
                    peers.len()
                );
            } else if status == reqwest::StatusCode::UNAUTHORIZED {
                eprintln!("[stash-daemon] sync push got 401 — account deleted or unlinked");
                clear_relay_token();
            } else {
                eprintln!("[stash-daemon] sync push failed: HTTP {}", status);
            }
        }
        Err(e) => {
            eprintln!("[stash-daemon] sync push error: {}", e);
        }
    }
}

// ── Action polling logic ─────────────────────────────────────

/// Returns true if any actions were executed (caller should trigger an immediate sync).
async fn poll_actions(client: &reqwest::Client, token: &str, projects: &[Project]) -> bool {
    let actions: Vec<PendingAction> = match client
        .get(format!("{}/pending", RELAY_URL))
        .bearer_auth(token)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            resp.json().await.unwrap_or_default()
        }
        Ok(resp) if resp.status() == reqwest::StatusCode::UNAUTHORIZED => {
            eprintln!("[stash-daemon] poll got 401 — account deleted or unlinked");
            clear_relay_token();
            return false;
        }
        Ok(resp) => {
            eprintln!("[stash-daemon] poll failed: HTTP {}", resp.status());
            return false;
        }
        Err(e) => {
            eprintln!("[stash-daemon] poll error: {}", e);
            return false;
        }
    };

    let mut executed_any = false;

    for action in actions {
        if action.action_type != "switch_profile" {
            eprintln!(
                "[stash-daemon] unknown action type: {}",
                action.action_type
            );
            continue;
        }

        let profile = match action.payload.get("profile").and_then(|v| v.as_str()) {
            Some(p) => p.to_string(),
            None => {
                eprintln!(
                    "[stash-daemon] action {} missing profile in payload",
                    action.id
                );
                continue;
            }
        };

        // Find the project path from projects list
        let project = match projects.iter().find(|p| p.id == action.project_id) {
            Some(p) => p,
            None => {
                eprintln!(
                    "[stash-daemon] action {} references unknown project {}",
                    action.id, action.project_id
                );
                continue;
            }
        };

        // Execute the profile switch
        match profile_manager::switch_profile(&project.path, &profile) {
            Ok(()) => {
                eprintln!(
                    "[stash-daemon] switched project '{}' to profile '{}'",
                    project.name, profile
                );
                executed_any = true;
            }
            Err(e) => {
                eprintln!(
                    "[stash-daemon] failed to switch '{}' to '{}': {}",
                    project.name, profile, e
                );
                continue;
            }
        }

        // Mark action as complete
        match client
            .post(format!("{}/pending/{}/complete", RELAY_URL, action.id))
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {}
            Ok(resp) => {
                eprintln!(
                    "[stash-daemon] complete action {} failed: HTTP {}",
                    action.id,
                    resp.status()
                );
            }
            Err(e) => {
                eprintln!(
                    "[stash-daemon] complete action {} error: {}",
                    action.id, e
                );
            }
        }
    }

    executed_any
}

// ── File watcher setup ───────────────────────────────────────

fn setup_file_watcher(
    projects: &[Project],
    tx: mpsc::UnboundedSender<()>,
) -> Option<RecommendedWatcher> {
    let sender = tx;
    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(event) = res {
            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                    // Trigger sync on:
                    //   - .env* files in project directories
                    //   - rotation.json / expiry.json / projects.json / git_scan_cache.json in ~/.stash/
                    let should_sync = event.paths.iter().any(|p| {
                        let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                        name.starts_with(".env")
                            || name == "rotation.json"
                            || name == "expiry.json"
                            || name == "projects.json"
                            || name == "git_scan_cache.json"
                    });
                    if should_sync {
                        let _ = sender.send(());
                    }
                }
                _ => {}
            }
        }
    })
    .ok()?;

    for project in projects {
        let path = std::path::Path::new(&project.path);
        if path.is_dir() {
            if let Err(e) = watcher.watch(path, RecursiveMode::NonRecursive) {
                eprintln!(
                    "[stash-daemon] failed to watch {}: {}",
                    project.path, e
                );
            }
        }
    }

    // Also watch ~/.stash/ for changes to projects.json, rotation.json, expiry.json, etc.
    let stash_path = stash_dir();
    if stash_path.is_dir() {
        if let Err(e) = watcher.watch(&stash_path, RecursiveMode::NonRecursive) {
            eprintln!("[stash-daemon] failed to watch stash dir: {}", e);
        }
    }

    Some(watcher)
}

// ── Main ─────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    eprintln!("[stash-daemon] starting...");

    // 1. Read relay token
    let token = match read_relay_token() {
        Some(t) => t,
        None => {
            // No token yet — wait for one to appear so the daemon can start
            // before linking and pick up the token automatically when the
            // user links from the watch.
            eprintln!("[stash-daemon] no relay token yet — waiting for link...");
            loop {
                tokio::time::sleep(Duration::from_secs(5)).await;
                if let Some(t) = read_relay_token() {
                    eprintln!("[stash-daemon] token found, starting sync");
                    break t;
                }
            }
        }
    };

    // 2. Load this Mac's device identity (creates on first run)
    let identity = load_or_create_identity();
    let workspace_label = read_workspace_label();
    eprintln!(
        "[stash-daemon] workspace: '{}' device={}",
        workspace_label,
        &identity.device_id[..8]
    );

    // 3. Load projects
    let projects = Arc::new(Mutex::new(load_projects()));
    eprintln!(
        "[stash-daemon] loaded {} projects",
        projects.lock().await.len()
    );

    // 4. Check vault session
    let has_session = read_session_key().is_some();
    eprintln!(
        "[stash-daemon] vault: {}",
        if has_session { "unlocked" } else { "locked" }
    );

    // 5. HTTP client
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to create HTTP client");

    // 6. Register this device with the relay (workspace)
    register_device(&client, &token, &identity, &workspace_label).await;

    // 7. Initial full sync push
    {
        let projs = projects.lock().await;
        push_sync(&client, &token, &projs, &identity.device_id).await;
    }

    // 6. Set up file watcher with debounce channel
    let (file_change_tx, mut file_change_rx) = mpsc::unbounded_channel::<()>();
    let _watcher = {
        let projs = projects.lock().await;
        setup_file_watcher(&projs, file_change_tx)
    };

    // Track last file change for debouncing
    let last_change: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));

    // 7. Spawn debounce consumer — collapses rapid file changes into one sync trigger
    let debounce_trigger = Arc::new(tokio::sync::Notify::new());
    {
        let last_change = last_change.clone();
        let trigger = debounce_trigger.clone();
        tokio::spawn(async move {
            while file_change_rx.recv().await.is_some() {
                *last_change.lock().await = Some(Instant::now());
                trigger.notify_one();
            }
        });
    }

    // 8. Run two main loops concurrently
    let sync_client = client.clone();
    let sync_projects = projects.clone();
    let sync_last_change = last_change.clone();
    let sync_trigger = debounce_trigger.clone();
    let sync_device_id = identity.device_id.clone();
    let sync_identity_pub = identity.public_key.clone();

    let sync_loop = tokio::spawn(async move {
        let identity_for_reregister = DaemonIdentity {
            device_id: sync_device_id.clone(),
            private_key: String::new(), // not needed for registration
            public_key: sync_identity_pub,
        };

        loop {
            // Wait for either the sync interval or a debounced file change
            tokio::select! {
                _ = tokio::time::sleep(SYNC_INTERVAL) => {}
                _ = sync_trigger.notified() => {
                    tokio::time::sleep(DEBOUNCE_DELAY).await;
                    loop {
                        let lc = sync_last_change.lock().await;
                        if let Some(last) = *lc {
                            if last.elapsed() < DEBOUNCE_DELAY {
                                drop(lc);
                                tokio::time::sleep(DEBOUNCE_DELAY).await;
                                continue;
                            }
                        }
                        break;
                    }
                }
            }

            // Re-read token on each cycle so we handle unlink gracefully
            let current_token = match read_relay_token() {
                Some(t) => t,
                None => {
                    eprintln!("[stash-daemon] token gone — unlinked. Pausing sync.");
                    continue;
                }
            };

            // Re-register on every cycle to keep LAN IP fresh
            let current_label = read_workspace_label();
            register_device(&sync_client, &current_token, &identity_for_reregister, &current_label).await;

            // Reload projects in case they changed
            let fresh_projects = load_projects();
            {
                let mut projs = sync_projects.lock().await;
                *projs = fresh_projects;
            }

            let projs = sync_projects.lock().await;
            push_sync(&sync_client, &current_token, &projs, &sync_device_id).await;
        }
    });

    let action_client = client.clone();
    let action_projects = projects.clone();
    let action_device_id = identity.device_id.clone();

    let action_loop = tokio::spawn(async move {
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;

            // Re-read token on each cycle
            let current_token = match read_relay_token() {
                Some(t) => t,
                None => continue, // silently skip polling if unlinked
            };

            // Reload projects so the action handler has the latest paths
            let fresh = load_projects();
            {
                let mut projs = action_projects.lock().await;
                *projs = fresh;
            }

            let projs = action_projects.lock().await;
            let executed = poll_actions(&action_client, &current_token, &projs).await;
            drop(projs);

            // If we executed any actions, push a fresh sync immediately so the
            // watch sees the new active profile without waiting for the next
            // sync interval (60s).
            if executed {
                let projs = action_projects.lock().await;
                push_sync(&action_client, &current_token, &projs, &action_device_id).await;
            }
        }
    });

    // 9. Local HTTP server for LAN-direct access
    let local_device_id = identity.device_id.clone();
    let local_projects = projects.clone();

    let local_server = tokio::spawn(async move {
        let health_device_id = local_device_id.clone();
        let projects_handle = local_projects.clone();
        let projects_device_id = local_device_id.clone();

        let app = axum::Router::new()
            .route("/health", axum::routing::get(move || {
                let did = health_device_id.clone();
                async move {
                    axum::Json(serde_json::json!({
                        "status": "ok",
                        "device_id": did,
                    }))
                }
            }))
            .route("/projects", axum::routing::get(move || {
                let projs = projects_handle.clone();
                let source_device_id = projects_device_id.clone();
                async move {
                    let projects = projs.lock().await;
                    let result: Vec<serde_json::Value> = projects
                        .iter()
                        .filter(|p| !p.local_only)
                        .map(|project| {
                            let active_profile = profile_manager::get_active_profile(&project.path);
                            let profile_names = profile_manager::list_profiles(&project.path);

                            // Count variables per profile
                            let mut variable_counts = serde_json::Map::new();
                            for profile_name in &profile_names {
                                let env_file = if profile_name == "default" {
                                    format!("{}/.env", project.path)
                                } else {
                                    format!("{}/.env.{}", project.path, profile_name)
                                };
                                let count = env_parser::read_env_file(&env_file)
                                    .map(|v| v.len())
                                    .unwrap_or(0);
                                variable_counts.insert(profile_name.clone(), serde_json::json!(count));
                            }

                            // Compute health
                            let rotation = load_rotation();
                            let expiry = load_expiry();
                            let exposures = load_git_exposures();
                            let now = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs();
                            let health = compute_project_health(project, &rotation, &expiry, &exposures, now);

                            serde_json::json!({
                                "id": project.id,
                                "source_device_id": source_device_id,
                                "name": project.name,
                                "path": project.path,
                                "framework": project.framework,
                                "active_profile": active_profile,
                                "profiles": profile_names,
                                "variable_counts": variable_counts,
                                "health": {
                                    "stale_count": health.stale_count,
                                    "expiring_count": health.expiring_count,
                                    "exposed_count": health.exposed_count,
                                },
                            })
                        })
                        .collect();
                    axum::Json(serde_json::json!(result))
                }
            }));

        let listener = tokio::net::TcpListener::bind("0.0.0.0:8445").await
            .expect("Failed to bind local server on port 8445");
        eprintln!("[stash-daemon] local server listening on 0.0.0.0:8445");
        axum::serve(listener, app).await.unwrap();
    });

    // Wait for all three loops (they run forever)
    let _ = tokio::join!(sync_loop, action_loop, local_server);
}
