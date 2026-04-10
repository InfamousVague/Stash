use std::path::Path;
use std::process::Command;

const CLI_INSTALL_PATH: &str = "/usr/local/bin/stash";

#[tauri::command]
pub fn check_cli_installed() -> bool {
    Path::new(CLI_INSTALL_PATH).exists()
}

#[tauri::command]
pub fn install_cli() -> Result<(), String> {
    // Find the CLI binary — in dev it's in target/debug, in release it's alongside the main binary
    let cli_src = find_cli_binary()?;

    // Use osascript to create dir + copy + chmod in a single admin prompt
    let script = format!(
        "do shell script \"mkdir -p '{}' && cp '{}' '{}' && chmod +x '{}'\" with administrator privileges",
        Path::new(CLI_INSTALL_PATH).parent().unwrap().display(),
        cli_src,
        CLI_INSTALL_PATH,
        CLI_INSTALL_PATH
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to run installer: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Install failed: {}", stderr.trim()));
    }

    log::info!("CLI installed to {}", CLI_INSTALL_PATH);
    Ok(())
}

fn find_cli_binary() -> Result<String, String> {
    // Check alongside the current executable (release builds)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("stash-cli");
            if candidate.exists() {
                return Ok(candidate.to_string_lossy().to_string());
            }
        }
    }

    // Dev mode: check target/debug
    if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
        let candidate = Path::new(&manifest).join("target/debug/stash-cli");
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    Err("CLI binary not found. Build with `cargo build --bin stash-cli` first.".to_string())
}
