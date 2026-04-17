use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
pub struct RelayConfig {
    #[serde(default)]
    pub server: ServerConfig,

    #[serde(skip)]
    config_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_data_dir")]
    pub data_dir: String,
}

fn default_host() -> String {
    "127.0.0.1".into()
}
fn default_port() -> u16 {
    8444
}
fn default_data_dir() -> String {
    dirs().join("data").to_string_lossy().into_owned()
}

fn dirs() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".stash-relay")
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: default_host(),
            port: default_port(),
            data_dir: default_data_dir(),
        }
    }
}

impl RelayConfig {
    pub fn load() -> anyhow::Result<Self> {
        let candidates = vec![
            PathBuf::from("/etc/stash/stash-relay.toml"),
            dirs().join("stash-relay.toml"),
            PathBuf::from("stash-relay.toml"),
        ];

        for path in &candidates {
            if path.exists() {
                let content = std::fs::read_to_string(path)?;
                let mut config: RelayConfig = toml::from_str(&content)?;
                config.config_path = Some(path.clone());
                return Ok(config);
            }
        }

        tracing::info!("No stash-relay.toml found, using defaults");
        Ok(Self::default())
    }

    pub fn resolved_path(&self) -> Option<&Path> {
        self.config_path.as_deref()
    }

    pub fn data_dir(&self) -> PathBuf {
        PathBuf::from(&self.server.data_dir)
    }
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            config_path: None,
        }
    }
}
