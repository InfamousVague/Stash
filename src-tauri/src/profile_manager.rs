use std::path::Path;

/// List available profile names by scanning for .env.* files.
/// Returns profile names (e.g., "local", "development", "production").
pub fn list_profiles(project_path: &str) -> Vec<String> {
    let dir = Path::new(project_path);
    let mut profiles = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return profiles,
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(".env.") && !name.ends_with(".tmp") {
            let profile_name = name.strip_prefix(".env.").unwrap().to_string();
            // Skip common non-profile suffixes
            if !["example", "sample", "template", "bak", "backup"].contains(&profile_name.as_str()) {
                profiles.push(profile_name);
            }
        }
    }

    profiles.sort();
    profiles
}

/// Get the currently active profile by checking if .env is a symlink.
/// Returns the profile name or "default" if .env is a regular file.
pub fn get_active_profile(project_path: &str) -> String {
    let env_path = Path::new(project_path).join(".env");

    if !env_path.exists() {
        return "default".to_string();
    }

    // Check if it's a symlink
    match std::fs::read_link(&env_path) {
        Ok(target) => {
            let target_name = target.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if let Some(profile) = target_name.strip_prefix(".env.") {
                profile.to_string()
            } else {
                "default".to_string()
            }
        }
        Err(_) => "default".to_string(),
    }
}

/// Switch the active profile by saving the current .env and symlinking to the target.
pub fn switch_profile(project_path: &str, to_profile: &str) -> Result<(), String> {
    let dir = Path::new(project_path);
    let env_path = dir.join(".env");
    let target_path = dir.join(format!(".env.{}", to_profile));

    if !target_path.exists() {
        return Err(format!("Profile '{}' does not exist at {}", to_profile, target_path.display()));
    }

    // If .env exists and is NOT a symlink, save it as .env.default first
    if env_path.exists() {
        let is_symlink = std::fs::symlink_metadata(&env_path)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false);

        if !is_symlink {
            let default_path = dir.join(".env.default");
            if !default_path.exists() {
                std::fs::copy(&env_path, &default_path)
                    .map_err(|e| format!("Failed to backup .env to .env.default: {}", e))?;
            }
        }

        // Remove the current .env (file or symlink)
        std::fs::remove_file(&env_path)
            .map_err(|e| format!("Failed to remove current .env: {}", e))?;
    }

    // Create symlink: .env -> .env.{profile}
    #[cfg(unix)]
    {
        let target_filename = format!(".env.{}", to_profile);
        std::os::unix::fs::symlink(&target_filename, &env_path)
            .map_err(|e| format!("Failed to create symlink: {}", e))?;
    }

    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_file(&target_path, &env_path)
            .map_err(|e| format!("Failed to create symlink: {}", e))?;
    }

    Ok(())
}

/// Create a new profile, optionally copying from an existing one.
pub fn create_profile(project_path: &str, name: &str, copy_from: Option<&str>) -> Result<(), String> {
    let dir = Path::new(project_path);
    let new_path = dir.join(format!(".env.{}", name));

    if new_path.exists() {
        return Err(format!("Profile '{}' already exists", name));
    }

    match copy_from {
        Some(source_profile) => {
            let source_path = dir.join(format!(".env.{}", source_profile));
            if !source_path.exists() {
                return Err(format!("Source profile '{}' does not exist", source_profile));
            }
            std::fs::copy(&source_path, &new_path)
                .map_err(|e| format!("Failed to copy profile: {}", e))?;
        }
        None => {
            // Create an empty .env file for the new profile
            std::fs::write(&new_path, "")
                .map_err(|e| format!("Failed to create profile: {}", e))?;
        }
    }

    Ok(())
}

/// Delete a profile's .env file.
pub fn delete_profile(project_path: &str, name: &str) -> Result<(), String> {
    let dir = Path::new(project_path);
    let profile_path = dir.join(format!(".env.{}", name));

    if !profile_path.exists() {
        return Err(format!("Profile '{}' does not exist", name));
    }

    // Don't allow deleting the currently active profile
    let active = get_active_profile(project_path);
    if active == name {
        return Err(format!("Cannot delete the currently active profile '{}'", name));
    }

    std::fs::remove_file(&profile_path)
        .map_err(|e| format!("Failed to delete profile: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // ── list_profiles ─────────────────────────────────────────

    #[test]
    fn test_list_profiles_finds_env_files() {
        let dir = TempDir::new().unwrap();
        let p = dir.path();
        std::fs::write(p.join(".env.local"), "").unwrap();
        std::fs::write(p.join(".env.production"), "").unwrap();
        std::fs::write(p.join(".env.staging"), "").unwrap();
        // Should be excluded
        std::fs::write(p.join(".env.example"), "").unwrap();
        std::fs::write(p.join(".env.bak"), "").unwrap();
        std::fs::write(p.join(".env.tmp"), "").unwrap();

        let profiles = list_profiles(p.to_str().unwrap());
        assert_eq!(profiles, vec!["local", "production", "staging"]);
    }

    #[test]
    fn test_list_profiles_empty_dir() {
        let dir = TempDir::new().unwrap();
        let profiles = list_profiles(dir.path().to_str().unwrap());
        assert!(profiles.is_empty());
    }

    #[test]
    fn test_list_profiles_nonexistent_dir() {
        let profiles = list_profiles("/tmp/nonexistent_stash_dir_xyz");
        assert!(profiles.is_empty());
    }

    // ── get_active_profile ────────────────────────────────────

    #[test]
    fn test_get_active_profile_no_env_file() {
        let dir = TempDir::new().unwrap();
        assert_eq!(get_active_profile(dir.path().to_str().unwrap()), "default");
    }

    #[test]
    fn test_get_active_profile_regular_file() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(".env"), "KEY=val").unwrap();
        assert_eq!(get_active_profile(dir.path().to_str().unwrap()), "default");
    }

    #[cfg(unix)]
    #[test]
    fn test_get_active_profile_symlink() {
        let dir = TempDir::new().unwrap();
        let p = dir.path();
        std::fs::write(p.join(".env.staging"), "KEY=val").unwrap();
        std::os::unix::fs::symlink(".env.staging", p.join(".env")).unwrap();
        assert_eq!(get_active_profile(p.to_str().unwrap()), "staging");
    }

    // ── switch_profile ────────────────────────────────────────

    #[cfg(unix)]
    #[test]
    fn test_switch_profile_creates_symlink() {
        let dir = TempDir::new().unwrap();
        let p = dir.path();
        std::fs::write(p.join(".env"), "DEFAULT=1").unwrap();
        std::fs::write(p.join(".env.production"), "PROD=1").unwrap();

        switch_profile(p.to_str().unwrap(), "production").unwrap();

        // .env should now be a symlink
        assert!(std::fs::symlink_metadata(p.join(".env")).unwrap().file_type().is_symlink());
        assert_eq!(get_active_profile(p.to_str().unwrap()), "production");
        // Old .env should be saved as .env.default
        assert!(p.join(".env.default").exists());
    }

    #[test]
    fn test_switch_profile_nonexistent_target() {
        let dir = TempDir::new().unwrap();
        let result = switch_profile(dir.path().to_str().unwrap(), "nope");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[cfg(unix)]
    #[test]
    fn test_switch_profile_preserves_existing_default() {
        let dir = TempDir::new().unwrap();
        let p = dir.path();
        // Already have a .env.default
        std::fs::write(p.join(".env.default"), "ORIG=1").unwrap();
        std::fs::write(p.join(".env"), "CURRENT=1").unwrap();
        std::fs::write(p.join(".env.staging"), "STAGING=1").unwrap();

        switch_profile(p.to_str().unwrap(), "staging").unwrap();
        // .env.default should still have original content
        let content = std::fs::read_to_string(p.join(".env.default")).unwrap();
        assert!(content.contains("ORIG=1"));
    }

    // ── create_profile ────────────────────────────────────────

    #[test]
    fn test_create_profile_empty() {
        let dir = TempDir::new().unwrap();
        create_profile(dir.path().to_str().unwrap(), "test", None).unwrap();
        assert!(dir.path().join(".env.test").exists());
        let content = std::fs::read_to_string(dir.path().join(".env.test")).unwrap();
        assert!(content.is_empty());
    }

    #[test]
    fn test_create_profile_copy_from() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(".env.source"), "A=1\nB=2").unwrap();
        create_profile(dir.path().to_str().unwrap(), "dest", Some("source")).unwrap();
        let content = std::fs::read_to_string(dir.path().join(".env.dest")).unwrap();
        assert!(content.contains("A=1"));
        assert!(content.contains("B=2"));
    }

    #[test]
    fn test_create_profile_already_exists() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(".env.existing"), "").unwrap();
        let result = create_profile(dir.path().to_str().unwrap(), "existing", None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[test]
    fn test_create_profile_copy_from_nonexistent() {
        let dir = TempDir::new().unwrap();
        let result = create_profile(dir.path().to_str().unwrap(), "new", Some("ghost"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    // ── delete_profile ────────────────────────────────────────

    #[test]
    fn test_delete_profile_removes_file() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(".env.todelete"), "X=1").unwrap();
        delete_profile(dir.path().to_str().unwrap(), "todelete").unwrap();
        assert!(!dir.path().join(".env.todelete").exists());
    }

    #[test]
    fn test_delete_profile_nonexistent() {
        let dir = TempDir::new().unwrap();
        let result = delete_profile(dir.path().to_str().unwrap(), "ghost");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[cfg(unix)]
    #[test]
    fn test_delete_profile_active_profile_blocked() {
        let dir = TempDir::new().unwrap();
        let p = dir.path();
        std::fs::write(p.join(".env.active"), "A=1").unwrap();
        std::os::unix::fs::symlink(".env.active", p.join(".env")).unwrap();
        let result = delete_profile(p.to_str().unwrap(), "active");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("currently active"));
    }
}
