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
        self.vault_key.lock().unwrap().is_some()
    }

    pub fn record_rotation(&self, project_id: &str, key: &str) {
        let composite = format!("{}:{}", project_id, key);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut rotation = self.rotation.lock().unwrap();
        rotation.insert(composite, now);
        // Save to disk
        let path = format!("{}/rotation.json", self.stash_dir);
        if let Ok(json) = serde_json::to_string(&*rotation) {
            std::fs::write(path, json).ok();
        }
    }

    pub fn get_rotation(&self, project_id: &str, key: &str) -> Option<u64> {
        let composite = format!("{}:{}", project_id, key);
        self.rotation.lock().unwrap().get(&composite).copied()
    }

    pub fn save_projects(&self) {
        let projects = self.projects.lock().unwrap();
        let path = format!("{}/projects.json", self.stash_dir);
        if let Ok(json) = serde_json::to_string_pretty(&*projects) {
            std::fs::write(path, json).ok();
        }
    }
}
