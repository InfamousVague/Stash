const RELAY_URL: &str = "https://stash.mattssoftware.com";

const LAUNCH_AGENT_LABEL: &str = "com.mattssoftware.stash-daemon";
const LAUNCH_AGENT_PLIST: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mattssoftware.stash-daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/Stash.app/Contents/MacOS/stash-daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/stash-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/stash-daemon.err</string>
</dict>
</plist>"#;

/// Check if the daemon is running and if the LaunchAgent is installed.
#[tauri::command]
pub fn relay_daemon_status() -> Result<serde_json::Value, String> {
    // Check if daemon process is running
    let running = std::process::Command::new("pgrep")
        .args(["-x", "stash-daemon"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Check if LaunchAgent plist exists
    let plist_path = dirs::home_dir()
        .unwrap_or_default()
        .join("Library/LaunchAgents/com.mattssoftware.stash-daemon.plist");
    let installed = plist_path.exists();

    Ok(serde_json::json!({
        "running": running,
        "launchAgentInstalled": installed,
    }))
}

/// Install the LaunchAgent and start the daemon.
#[tauri::command]
pub fn relay_install_daemon() -> Result<(), String> {
    let plist_path = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join("Library/LaunchAgents/com.mattssoftware.stash-daemon.plist");

    // Create LaunchAgents dir if needed
    if let Some(parent) = plist_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create LaunchAgents dir: {}", e))?;
    }

    // Write plist
    std::fs::write(&plist_path, LAUNCH_AGENT_PLIST)
        .map_err(|e| format!("Failed to write plist: {}", e))?;

    // Unload first (ignore errors — may not be loaded)
    let _ = std::process::Command::new("launchctl")
        .args(["unload", &plist_path.to_string_lossy()])
        .output();

    // Load
    std::process::Command::new("launchctl")
        .args(["load", &plist_path.to_string_lossy()])
        .output()
        .map_err(|e| format!("Failed to load LaunchAgent: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn relay_sign_in_with_apple(
    identity_token: String,
    user_identifier: String,
    email: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "identity_token": identity_token,
        "user_identifier": user_identifier,
        "email": email.unwrap_or_default()
    });

    let resp = client
        .post(format!("{}/auth/apple", RELAY_URL))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Sign-in failed: {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;
    let token = json["token"]
        .as_str()
        .ok_or("No token in response")?;

    let stash_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".stash");
    std::fs::create_dir_all(&stash_dir)
        .map_err(|e| format!("Failed to create .stash dir: {}", e))?;
    std::fs::write(stash_dir.join("relay_token"), token)
        .map_err(|e| format!("Failed to save token: {}", e))?;

    Ok(token.to_string())
}

#[tauri::command]
pub fn relay_get_status() -> Result<serde_json::Value, String> {
    let stash_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".stash");
    let token_path = stash_dir.join("relay_token");
    let connected = token_path.exists()
        && std::fs::read_to_string(&token_path)
            .map(|t| !t.trim().is_empty())
            .unwrap_or(false);

    Ok(serde_json::json!({
        "connected": connected,
        "relay_url": RELAY_URL,
    }))
}

#[tauri::command]
pub fn relay_disconnect() -> Result<(), String> {
    let stash_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".stash");
    let token_path = stash_dir.join("relay_token");
    if token_path.exists() {
        std::fs::remove_file(&token_path)
            .map_err(|e| format!("Failed to remove token: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn relay_generate_link_code() -> Result<serde_json::Value, String> {
    let stash_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".stash");
    let token = std::fs::read_to_string(stash_dir.join("relay_token"))
        .map_err(|_| "Not signed in to relay".to_string())?;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/auth/link-code", RELAY_URL))
        .bearer_auth(token.trim())
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to generate code: {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;
    Ok(json)
}

// ── Workspace label ──────────────────────────────────────────

fn workspace_file_path() -> Result<std::path::PathBuf, String> {
    let stash_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".stash");
    std::fs::create_dir_all(&stash_dir)
        .map_err(|e| format!("Failed to create .stash dir: {}", e))?;
    Ok(stash_dir.join("workspace.txt"))
}

#[tauri::command]
pub fn relay_get_workspace_label() -> Result<String, String> {
    let path = workspace_file_path()?;
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let label = content.trim();
    if label.is_empty() {
        // Default to hostname
        let host = std::process::Command::new("scutil")
            .args(["--get", "ComputerName"])
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Mac".to_string());
        Ok(host)
    } else {
        Ok(label.to_string())
    }
}

#[tauri::command]
pub fn relay_set_workspace_label(label: String) -> Result<(), String> {
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return Err("Workspace label cannot be empty".to_string());
    }
    let path = workspace_file_path()?;
    std::fs::write(&path, trimmed).map_err(|e| format!("Failed to write workspace label: {}", e))?;
    Ok(())
}

/// Fetch all linked devices (watches, other Macs) from the relay.
#[tauri::command]
pub async fn relay_get_linked_devices() -> Result<serde_json::Value, String> {
    let stash_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".stash");
    let token = std::fs::read_to_string(stash_dir.join("relay_token"))
        .map_err(|_| "Not linked to relay".to_string())?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/auth/device-keys", RELAY_URL))
        .bearer_auth(token.trim())
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to fetch devices: {}", resp.status()));
    }

    resp.json().await.map_err(|e| format!("Parse error: {}", e))
}

/// Unlink a specific device by its device_id (removes its key + projects from relay).
#[tauri::command]
pub async fn relay_unlink_device(device_id: String) -> Result<(), String> {
    let stash_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".stash");
    let token = std::fs::read_to_string(stash_dir.join("relay_token"))
        .map_err(|_| "Not linked to relay".to_string())?;

    let client = reqwest::Client::new();
    let resp = client
        .delete(format!("{}/auth/device-key/{}", RELAY_URL, device_id))
        .bearer_auth(token.trim())
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to unlink device: {}", resp.status()));
    }

    Ok(())
}

#[tauri::command]
pub fn relay_sign_in_with_apple_web() -> Result<(), String> {
    let client_id = "com.mattssoftware.stash.web";
    let redirect_uri = "https%3A%2F%2Fstash.mattssoftware.com%2Fauth%2Fapple-callback";
    let state = uuid::Uuid::new_v4().to_string();

    let auth_url = format!(
        "https://appleid.apple.com/auth/authorize?client_id={}&redirect_uri={}&response_type=code%20id_token&state={}&scope=email&response_mode=form_post",
        client_id, redirect_uri, state
    );

    std::process::Command::new("open")
        .arg(&auth_url)
        .spawn()
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn relay_save_token(token: String) -> Result<(), String> {
    let stash_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".stash");
    std::fs::create_dir_all(&stash_dir)
        .map_err(|e| format!("Failed to create .stash dir: {}", e))?;
    std::fs::write(stash_dir.join("relay_token"), &token)
        .map_err(|e| format!("Failed to save token: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn relay_redeem_link_code(code: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/auth/link-redeem", RELAY_URL))
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Invalid or expired code: {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;
    let token = json["token"]
        .as_str()
        .ok_or("No token in response")?;

    let stash_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".stash");
    std::fs::create_dir_all(&stash_dir)
        .map_err(|e| format!("Failed to create .stash dir: {}", e))?;
    std::fs::write(stash_dir.join("relay_token"), token)
        .map_err(|e| format!("Failed to save token: {}", e))?;

    Ok(token.to_string())
}
