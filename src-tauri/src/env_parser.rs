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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::EnvVar;
    use tempfile::TempDir;

    fn make_var(key: &str, value: &str) -> EnvVar {
        EnvVar { key: key.to_string(), value: value.to_string() }
    }

    // ── parse_env ──────────────────────────────────────────────

    #[test]
    fn test_parse_env_simple_key_value() {
        let vars = parse_env("FOO=bar\nBAZ=qux");
        assert_eq!(vars.len(), 2);
        assert_eq!(vars[0].key, "FOO");
        assert_eq!(vars[0].value, "bar");
        assert_eq!(vars[1].key, "BAZ");
        assert_eq!(vars[1].value, "qux");
    }

    #[test]
    fn test_parse_env_double_quoted_values() {
        let vars = parse_env("KEY=\"hello world\"");
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].value, "hello world");
    }

    #[test]
    fn test_parse_env_single_quoted_values() {
        let vars = parse_env("KEY='hello world'");
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].value, "hello world");
    }

    #[test]
    fn test_parse_env_comments_skipped() {
        let vars = parse_env("# this is a comment\nKEY=value");
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].key, "KEY");
    }

    #[test]
    fn test_parse_env_blank_lines_skipped() {
        let vars = parse_env("A=1\n\n\nB=2\n  \nC=3");
        assert_eq!(vars.len(), 3);
    }

    #[test]
    fn test_parse_env_inline_comment_stripped() {
        let vars = parse_env("KEY=value # this is inline");
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].value, "value");
    }

    #[test]
    fn test_parse_env_inline_comment_not_stripped_in_quotes() {
        let vars = parse_env("KEY=\"value # not a comment\"");
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].value, "value # not a comment");
    }

    #[test]
    fn test_parse_env_empty_value() {
        let vars = parse_env("KEY=");
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].value, "");
    }

    #[test]
    fn test_parse_env_value_with_equals() {
        let vars = parse_env("KEY=abc=def");
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].value, "abc=def");
    }

    #[test]
    fn test_parse_env_no_equals_line_skipped() {
        let vars = parse_env("NOPE\nKEY=val");
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].key, "KEY");
    }

    #[test]
    fn test_parse_env_whitespace_around_key_value() {
        let vars = parse_env("  KEY = value  ");
        assert_eq!(vars.len(), 1);
        // The key includes " KEY " trimmed on the line, then trimmed at split
        assert_eq!(vars[0].key, "KEY");
        assert_eq!(vars[0].value, "value");
    }

    // ── read_env_file / write_env_file ────────────────────────

    #[test]
    fn test_read_env_file_success() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        std::fs::write(&path, "A=1\nB=2\n").unwrap();
        let vars = read_env_file(path.to_str().unwrap()).unwrap();
        assert_eq!(vars.len(), 2);
    }

    #[test]
    fn test_read_env_file_not_found() {
        let result = read_env_file("/tmp/nonexistent_stash_test_file");
        assert!(result.is_err());
    }

    #[test]
    fn test_write_env_file_creates_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        let vars = vec![make_var("FOO", "bar"), make_var("BAZ", "qux")];
        write_env_file(path.to_str().unwrap(), &vars).unwrap();
        assert!(path.exists());
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("FOO=bar"));
        assert!(content.contains("BAZ=qux"));
    }

    #[test]
    fn test_write_env_file_quotes_values_with_spaces() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        let vars = vec![make_var("KEY", "hello world")];
        write_env_file(path.to_str().unwrap(), &vars).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("KEY=\"hello world\""));
    }

    // ── update_var_in_file ────────────────────────────────────

    #[test]
    fn test_update_var_in_file_existing_key() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        std::fs::write(&path, "A=old\nB=keep\n").unwrap();
        update_var_in_file(path.to_str().unwrap(), "A", "new").unwrap();
        let vars = read_env_file(path.to_str().unwrap()).unwrap();
        assert_eq!(vars.iter().find(|v| v.key == "A").unwrap().value, "new");
        assert_eq!(vars.iter().find(|v| v.key == "B").unwrap().value, "keep");
    }

    #[test]
    fn test_update_var_in_file_key_not_found() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        std::fs::write(&path, "A=1\n").unwrap();
        let result = update_var_in_file(path.to_str().unwrap(), "MISSING", "val");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    // ── add_var_to_file ───────────────────────────────────────

    #[test]
    fn test_add_var_to_file_new_key() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        std::fs::write(&path, "A=1\n").unwrap();
        add_var_to_file(path.to_str().unwrap(), "B", "2").unwrap();
        let vars = read_env_file(path.to_str().unwrap()).unwrap();
        assert_eq!(vars.len(), 2);
        assert_eq!(vars[1].key, "B");
    }

    #[test]
    fn test_add_var_to_file_duplicate_key_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        std::fs::write(&path, "A=1\n").unwrap();
        let result = add_var_to_file(path.to_str().unwrap(), "A", "2");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[test]
    fn test_add_var_to_file_creates_file_if_missing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        add_var_to_file(path.to_str().unwrap(), "NEW", "val").unwrap();
        let vars = read_env_file(path.to_str().unwrap()).unwrap();
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].key, "NEW");
    }

    // ── remove_var_from_file ──────────────────────────────────

    #[test]
    fn test_remove_var_from_file_existing_key() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        std::fs::write(&path, "A=1\nB=2\n").unwrap();
        remove_var_from_file(path.to_str().unwrap(), "A").unwrap();
        let vars = read_env_file(path.to_str().unwrap()).unwrap();
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].key, "B");
    }

    #[test]
    fn test_remove_var_from_file_key_not_found() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        std::fs::write(&path, "A=1\n").unwrap();
        let result = remove_var_from_file(path.to_str().unwrap(), "MISSING");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    // ── round-trip ────────────────────────────────────────────

    #[test]
    fn test_round_trip_parse_write_parse() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");

        let original = vec![
            make_var("SIMPLE", "value"),
            make_var("SPACED", "hello world"),
            make_var("EMPTY", ""),
            make_var("URL", "https://example.com?foo=bar&baz=1"),
        ];

        write_env_file(path.to_str().unwrap(), &original).unwrap();
        let parsed = read_env_file(path.to_str().unwrap()).unwrap();

        assert_eq!(parsed.len(), original.len());
        for (o, p) in original.iter().zip(parsed.iter()) {
            assert_eq!(o.key, p.key, "key mismatch for {}", o.key);
            assert_eq!(o.value, p.value, "value mismatch for key {}", o.key);
        }
    }
}
