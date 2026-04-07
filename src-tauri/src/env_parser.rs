use crate::state::EnvVar;
use std::path::Path;

/// Parse .env content into key-value pairs.
/// Handles quoted values and skips comments/blank lines.
pub fn parse_env(content: &str) -> Vec<EnvVar> {
    let mut vars = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();

        // Skip empty lines and comments
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Find the first '=' to split key and value
        let Some(eq_pos) = trimmed.find('=') else {
            continue;
        };

        let key = trimmed[..eq_pos].trim().to_string();
        if key.is_empty() {
            continue;
        }

        let raw_value = trimmed[eq_pos + 1..].trim();

        // Handle quoted values
        let value = if (raw_value.starts_with('"') && raw_value.ends_with('"'))
            || (raw_value.starts_with('\'') && raw_value.ends_with('\''))
        {
            if raw_value.len() >= 2 {
                raw_value[1..raw_value.len() - 1].to_string()
            } else {
                String::new()
            }
        } else {
            // Strip inline comments (space + #)
            raw_value
                .split_once(" #")
                .map(|(v, _)| v.trim())
                .unwrap_or(raw_value)
                .to_string()
        };

        vars.push(EnvVar { key, value });
    }

    vars
}

/// Read and parse an .env file from disk.
pub fn read_env_file(path: &str) -> Result<Vec<EnvVar>, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path, e))?;
    Ok(parse_env(&content))
}

/// Write env vars to a file atomically (temp file + rename).
pub fn write_env_file(path: &str, vars: &[EnvVar]) -> Result<(), String> {
    let mut content = String::new();
    for var in vars {
        // Quote values that contain spaces, #, or special chars
        if var.value.contains(' ') || var.value.contains('#') || var.value.contains('"') {
            let escaped = var.value.replace('\\', "\\\\").replace('"', "\\\"");
            content.push_str(&format!("{}=\"{}\"\n", var.key, escaped));
        } else {
            content.push_str(&format!("{}={}\n", var.key, var.value));
        }
    }

    let dest = Path::new(path);
    let parent = dest.parent().ok_or("Invalid file path")?;
    let temp_path = parent.join(format!(".env.tmp.{}", uuid::Uuid::new_v4()));

    std::fs::write(&temp_path, &content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    std::fs::rename(&temp_path, dest)
        .map_err(|e| {
            // Clean up temp file on rename failure
            let _ = std::fs::remove_file(&temp_path);
            format!("Failed to rename temp file: {}", e)
        })?;

    Ok(())
}

/// Update a single variable in an existing .env file.
pub fn update_var_in_file(path: &str, key: &str, value: &str) -> Result<(), String> {
    let mut vars = read_env_file(path)?;

    let found = vars.iter_mut().find(|v| v.key == key);
    match found {
        Some(var) => {
            var.value = value.to_string();
        }
        None => {
            return Err(format!("Variable '{}' not found in {}", key, path));
        }
    }

    write_env_file(path, &vars)
}

/// Add a new variable to the end of an .env file.
pub fn add_var_to_file(path: &str, key: &str, value: &str) -> Result<(), String> {
    let mut vars = read_env_file(path).unwrap_or_default();

    // Check for duplicates
    if vars.iter().any(|v| v.key == key) {
        return Err(format!("Variable '{}' already exists in {}", key, path));
    }

    vars.push(EnvVar {
        key: key.to_string(),
        value: value.to_string(),
    });

    write_env_file(path, &vars)
}

/// Remove a variable from an .env file.
pub fn remove_var_from_file(path: &str, key: &str) -> Result<(), String> {
    let mut vars = read_env_file(path)?;
    let original_len = vars.len();

    vars.retain(|v| v.key != key);

    if vars.len() == original_len {
        return Err(format!("Variable '{}' not found in {}", key, path));
    }

    write_env_file(path, &vars)
}
