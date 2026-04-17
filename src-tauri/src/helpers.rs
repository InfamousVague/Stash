use std::path::{Path, PathBuf};

/// Returns the `.env` file path for a given profile.
/// For "default", returns `.env`; otherwise `.env.{profile}`.
pub fn profile_env_path(project_path: &str, profile: &str) -> PathBuf {
    if profile == "default" {
        Path::new(project_path).join(".env")
    } else {
        Path::new(project_path).join(format!(".env.{}", profile))
    }
}

/// Returns the backup path for a given profile's `.env` file.
/// For "default", returns `.env.backup`; otherwise `.env.{profile}.backup`.
pub fn profile_backup_path(project_path: &str, profile: &str) -> PathBuf {
    if profile == "default" {
        Path::new(project_path).join(".env.backup")
    } else {
        Path::new(project_path).join(format!(".env.{}.backup", profile))
    }
}
