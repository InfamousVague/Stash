use std::sync::{Arc, Mutex, atomic::AtomicBool};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ScanProgress {
    pub directories_scanned: u32,
    pub files_found: u32,
    pub current_dir: String,
    pub complete: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct EnvFile {
    pub path: String,
    pub filename: String,
    pub file_type: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct EnvFileGroup {
    pub project_name: String,
    pub project_path: String,
    pub env_files: Vec<EnvFile>,
    pub framework: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub framework: Option<String>,
    pub active_profile: String,
    pub profiles: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

pub struct AppState {
    pub scan_running: Arc<AtomicBool>,
    pub scan_results: Arc<Mutex<Vec<EnvFileGroup>>>,
    pub projects: Arc<Mutex<Vec<Project>>>,
    pub vault_key: Arc<Mutex<Option<[u8; 32]>>>,
    /// Tracks when each key was last modified: "{project_id}:{key}" -> unix timestamp
    pub rotation: Arc<Mutex<std::collections::HashMap<String, u64>>>,
    pub stash_dir: String,
}

impl AppState {
    pub fn new() -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        let stash_dir = home.join(".stash");
        std::fs::create_dir_all(&stash_dir).ok();

        let projects_path = stash_dir.join("projects.json");
        let projects = if projects_path.exists() {
            std::fs::read_to_string(&projects_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        // Load rotation data
        let rotation_path = stash_dir.join("rotation.json");
        let rotation: std::collections::HashMap<String, u64> = if rotation_path.exists() {
            std::fs::read_to_string(&rotation_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            std::collections::HashMap::new()
        };

        Self {
            scan_running: Arc::new(AtomicBool::new(false)),
            scan_results: Arc::new(Mutex::new(Vec::new())),
            projects: Arc::new(Mutex::new(projects)),
            vault_key: Arc::new(Mutex::new(None)),
            rotation: Arc::new(Mutex::new(rotation)),
            stash_dir: stash_dir.to_string_lossy().to_string(),
        }
    }

    pub fn is_unlocked(&self) -> bool {
        self.vault_key.lock().map(|vk| vk.is_some()).unwrap_or(false)
    }

    pub fn record_rotation(&self, project_id: &str, key: &str) {
        let composite = format!("{}:{}", project_id, key);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        if let Ok(mut rotation) = self.rotation.lock() {
            rotation.insert(composite, now);
            // Save to disk
            let path = format!("{}/rotation.json", self.stash_dir);
            if let Ok(json) = serde_json::to_string(&*rotation) {
                std::fs::write(path, json).ok();
            }
        }
    }

    pub fn get_rotation(&self, project_id: &str, key: &str) -> Option<u64> {
        let composite = format!("{}:{}", project_id, key);
        self.rotation.lock().ok()?.get(&composite).copied()
    }

    pub fn get_project_path(&self, project_id: &str) -> Result<String, String> {
        let projects = self.projects.lock()
            .map_err(|_| "Lock poisoned".to_string())?;
        projects.iter()
            .find(|p| p.id == project_id)
            .map(|p| p.path.clone())
            .ok_or_else(|| "Project not found".to_string())
    }

    pub fn save_projects(&self) {
        if let Ok(projects) = self.projects.lock() {
            let path = format!("{}/projects.json", self.stash_dir);
            if let Ok(json) = serde_json::to_string_pretty(&*projects) {
                std::fs::write(path, json).ok();
            }
        }
    }

    /// Create an AppState with a custom stash_dir (for testing).
    #[cfg(test)]
    pub fn new_with_dir(stash_dir: &str) -> Self {
        std::fs::create_dir_all(stash_dir).ok();

        let projects_path = format!("{}/projects.json", stash_dir);
        let projects: Vec<Project> = if std::path::Path::new(&projects_path).exists() {
            std::fs::read_to_string(&projects_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        let rotation_path = format!("{}/rotation.json", stash_dir);
        let rotation: std::collections::HashMap<String, u64> =
            if std::path::Path::new(&rotation_path).exists() {
                std::fs::read_to_string(&rotation_path)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default()
            } else {
                std::collections::HashMap::new()
            };

        Self {
            scan_running: Arc::new(AtomicBool::new(false)),
            scan_results: Arc::new(Mutex::new(Vec::new())),
            projects: Arc::new(Mutex::new(projects)),
            vault_key: Arc::new(Mutex::new(None)),
            rotation: Arc::new(Mutex::new(rotation)),
            stash_dir: stash_dir.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // ── AppState::new_with_dir ────────────────────────────────

    #[test]
    fn test_appstate_new_creates_stash_dir() {
        let dir = TempDir::new().unwrap();
        let stash = dir.path().join("stash_test");
        let _state = AppState::new_with_dir(stash.to_str().unwrap());
        assert!(stash.exists(), "stash dir should be created");
    }

    // ── is_unlocked ───────────────────────────────────────────

    #[test]
    fn test_is_unlocked_false_initially() {
        let dir = TempDir::new().unwrap();
        let state = AppState::new_with_dir(dir.path().to_str().unwrap());
        assert!(!state.is_unlocked());
    }

    #[test]
    fn test_is_unlocked_true_after_setting_key() {
        let dir = TempDir::new().unwrap();
        let state = AppState::new_with_dir(dir.path().to_str().unwrap());
        {
            let mut vk = state.vault_key.lock().unwrap();
            *vk = Some([1u8; 32]);
        }
        assert!(state.is_unlocked());
    }

    // ── save_projects / load round-trip ───────────────────────

    #[test]
    fn test_save_and_load_projects_round_trip() {
        let dir = TempDir::new().unwrap();
        let stash_path = dir.path().to_str().unwrap();

        // Create state and add a project
        let state = AppState::new_with_dir(stash_path);
        {
            let mut projects = state.projects.lock().unwrap();
            projects.push(Project {
                id: "proj1".to_string(),
                name: "My Project".to_string(),
                path: "/tmp/myproject".to_string(),
                framework: Some("react".to_string()),
                active_profile: "default".to_string(),
                profiles: vec!["default".to_string(), "production".to_string()],
            });
        }
        state.save_projects();

        // Load into a new state
        let state2 = AppState::new_with_dir(stash_path);
        let projects = state2.projects.lock().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "My Project");
        assert_eq!(projects[0].framework, Some("react".to_string()));
        assert_eq!(projects[0].profiles.len(), 2);
    }

    // ── record_rotation / get_rotation ────────────────────────

    #[test]
    fn test_record_and_get_rotation() {
        let dir = TempDir::new().unwrap();
        let state = AppState::new_with_dir(dir.path().to_str().unwrap());

        assert!(state.get_rotation("proj1", "API_KEY").is_none());

        state.record_rotation("proj1", "API_KEY");
        let ts = state.get_rotation("proj1", "API_KEY");
        assert!(ts.is_some(), "rotation should be recorded");

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        // Timestamp should be within 2 seconds of now
        assert!(ts.unwrap().abs_diff(now) < 2, "rotation timestamp should be recent");
    }

    #[test]
    fn test_rotation_persists_to_disk() {
        let dir = TempDir::new().unwrap();
        let stash_path = dir.path().to_str().unwrap();

        let state = AppState::new_with_dir(stash_path);
        state.record_rotation("proj1", "SECRET");

        // Load into new state
        let state2 = AppState::new_with_dir(stash_path);
        assert!(state2.get_rotation("proj1", "SECRET").is_some());
    }

    #[test]
    fn test_rotation_different_keys_independent() {
        let dir = TempDir::new().unwrap();
        let state = AppState::new_with_dir(dir.path().to_str().unwrap());

        state.record_rotation("proj1", "KEY_A");
        assert!(state.get_rotation("proj1", "KEY_A").is_some());
        assert!(state.get_rotation("proj1", "KEY_B").is_none());
        assert!(state.get_rotation("proj2", "KEY_A").is_none());
    }
}
