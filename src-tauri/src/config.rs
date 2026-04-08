use std::path::Path;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub scan_directories: Vec<String>,
    pub setup_complete: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            scan_directories: Vec::new(),
            setup_complete: false,
        }
    }
}

pub fn config_path(stash_dir: &str) -> String {
    format!("{}/config.json", stash_dir)
}

pub fn load_config(stash_dir: &str) -> AppConfig {
    let path = config_path(stash_dir);
    if !Path::new(&path).exists() {
        return AppConfig::default();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_config(stash_dir: &str, config: &AppConfig) -> Result<(), String> {
    let path = config_path(stash_dir);
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to save config: {}", e))
}

/// List directories in the home folder that are likely dev directories
pub fn suggest_scan_directories() -> Vec<String> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut suggestions = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&home) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Skip hidden dirs and system dirs
            if name.starts_with('.') {
                continue;
            }
            // Skip known non-dev dirs
            let skip = ["Library", "Pictures", "Music", "Movies", "Public",
                        "Applications", "Volumes", "System", "usr", "bin",
                        "sbin", "etc", "var", "tmp", "opt", "cores"];
            if skip.contains(&name.as_str()) {
                continue;
            }

            suggestions.push(path.to_string_lossy().to_string());
        }
    }

    suggestions.sort();
    suggestions
}
