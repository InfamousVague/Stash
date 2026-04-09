use crate::env_parser;
use crate::state::{AppState, GitExposure, GitScanCache, HealthIssue, HealthReport, HealthSummary, Project};
use std::collections::HashMap;
use std::path::Path;
use tauri::Emitter;

/// Trivial values to skip when detecting duplicates.
fn is_trivial_value(value: &str) -> bool {
    if value.len() <= 8 {
        return true;
    }
    let lower = value.to_lowercase();
    matches!(
        lower.as_str(),
        "true" | "false" | "localhost" | "127.0.0.1" | "development" | "production" | "staging" | "test"
    )
}

/// Format-validate a single key-value pair. Returns an optional (severity, details) tuple.
fn validate_format(key: &str, value: &str) -> Option<(&'static str, String)> {
    let upper_key = key.to_uppercase();

    // Empty value
    if value.is_empty() {
        return Some(("info", "Variable has no value set".to_string()));
    }

    // Trailing whitespace
    if value != value.trim_end() {
        return Some(("warning", "Value has trailing whitespace".to_string()));
    }

    // AWS access key
    if upper_key.contains("AWS_ACCESS_KEY") {
        if !value.starts_with("AKIA") || value.len() != 20 {
            return Some((
                "warning",
                "AWS access keys should start with AKIA and be 20 characters".to_string(),
            ));
        }
    }

    // Stripe keys
    if upper_key.starts_with("STRIPE_") && (upper_key.contains("KEY") || upper_key.contains("SECRET")) {
        let valid_prefixes = ["sk_live_", "sk_test_", "pk_live_", "pk_test_", "rk_live_", "rk_test_"];
        if !valid_prefixes.iter().any(|p| value.starts_with(p)) {
            return Some((
                "warning",
                "Stripe keys should start with sk_live_, sk_test_, pk_live_, or pk_test_".to_string(),
            ));
        }
    }

    // GitHub tokens
    if upper_key.contains("GITHUB_TOKEN") || upper_key.contains("GH_TOKEN") {
        let valid_prefixes = ["ghp_", "gho_", "ghs_", "github_pat_"];
        if !valid_prefixes.iter().any(|p| value.starts_with(p)) && !value.is_empty() {
            return Some((
                "warning",
                "GitHub tokens should start with ghp_, gho_, ghs_, or github_pat_".to_string(),
            ));
        }
    }

    // URL validation
    if upper_key.ends_with("_URL") || upper_key.ends_with("_URI") {
        if !value.contains("://") {
            return Some((
                "info",
                "URL values should include a protocol (e.g. https://, postgres://)".to_string(),
            ));
        }
    }

    // Port validation
    if upper_key.ends_with("_PORT") {
        if value.parse::<u16>().is_err() {
            return Some((
                "info",
                "Port values should be a number between 1 and 65535".to_string(),
            ));
        }
    }

    None
}

#[tauri::command]
pub fn get_health_report(state: tauri::State<'_, AppState>) -> HealthReport {
    let projects = state
        .projects
        .lock()
        .map(|p| p.clone())
        .unwrap_or_default();
    let rotation = state
        .rotation
        .lock()
        .map(|r| r.clone())
        .unwrap_or_default();
    let expiry = state
        .expiry
        .lock()
        .map(|e| e.clone())
        .unwrap_or_default();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut issues: Vec<HealthIssue> = Vec::new();

    // Collect all vars across all projects for duplicate/overlap detection
    let mut value_map: HashMap<String, Vec<(String, String, String)>> = HashMap::new(); // value -> [(pid, pname, key)]
    let mut key_map: HashMap<String, Vec<(String, String)>> = HashMap::new(); // key -> [(pid, pname)]

    for project in &projects {
        let env_path = format!("{}/.env", project.path);
        let vars = match env_parser::read_env_file(&env_path) {
            Ok(v) => v,
            Err(_) => continue,
        };

        for var in &vars {
            let composite = format!("{}:{}", project.id, var.key);

            // Staleness check
            if let Some(ts) = rotation.get(&composite) {
                let days = (now.saturating_sub(*ts)) / 86400;
                if days > 90 {
                    issues.push(HealthIssue {
                        key: var.key.clone(),
                        project_id: project.id.clone(),
                        project_name: project.name.clone(),
                        issue_type: "stale".to_string(),
                        severity: "critical".to_string(),
                        details: format!("Not rotated in {} days", days),
                    });
                } else if days > 30 {
                    issues.push(HealthIssue {
                        key: var.key.clone(),
                        project_id: project.id.clone(),
                        project_name: project.name.clone(),
                        issue_type: "stale".to_string(),
                        severity: "warning".to_string(),
                        details: format!("Not rotated in {} days", days),
                    });
                }
            }

            // Expiry check
            if let Some(exp_ts) = expiry.get(&composite) {
                if *exp_ts <= now {
                    issues.push(HealthIssue {
                        key: var.key.clone(),
                        project_id: project.id.clone(),
                        project_name: project.name.clone(),
                        issue_type: "expiring".to_string(),
                        severity: "critical".to_string(),
                        details: "Key has expired".to_string(),
                    });
                } else {
                    let days_until = (exp_ts - now) / 86400;
                    if days_until <= 7 {
                        issues.push(HealthIssue {
                            key: var.key.clone(),
                            project_id: project.id.clone(),
                            project_name: project.name.clone(),
                            issue_type: "expiring".to_string(),
                            severity: "warning".to_string(),
                            details: format!("Expires in {} days", days_until),
                        });
                    }
                }
            }

            // Format validation
            if let Some((severity, details)) = validate_format(&var.key, &var.value) {
                issues.push(HealthIssue {
                    key: var.key.clone(),
                    project_id: project.id.clone(),
                    project_name: project.name.clone(),
                    issue_type: "format".to_string(),
                    severity: severity.to_string(),
                    details,
                });
            }

            // Collect for duplicate value detection
            if !is_trivial_value(&var.value) {
                value_map
                    .entry(var.value.clone())
                    .or_default()
                    .push((project.id.clone(), project.name.clone(), var.key.clone()));
            }

            // Collect for overlapping key detection
            key_map
                .entry(var.key.clone())
                .or_default()
                .push((project.id.clone(), project.name.clone()));
        }
    }

    // Duplicate detection: values appearing in 2+ different projects
    for (_value, entries) in &value_map {
        // Collect unique project IDs
        let unique_pids: std::collections::HashSet<&str> =
            entries.iter().map(|(pid, _, _)| pid.as_str()).collect();
        if unique_pids.len() < 2 {
            continue;
        }

        for (pid, pname, key) in entries {
            let other_projects: Vec<&str> = entries
                .iter()
                .filter(|(other_pid, _, _)| other_pid != pid)
                .map(|(_, other_name, _)| other_name.as_str())
                .collect();
            issues.push(HealthIssue {
                key: key.clone(),
                project_id: pid.clone(),
                project_name: pname.clone(),
                issue_type: "duplicate".to_string(),
                severity: "warning".to_string(),
                details: format!("Same value found in: {}", other_projects.join(", ")),
            });
        }
    }

    // Overlapping keys: same key name in 2+ projects (values may differ)
    for (key, entries) in &key_map {
        let unique_pids: std::collections::HashSet<&str> =
            entries.iter().map(|(pid, _)| pid.as_str()).collect();
        if unique_pids.len() < 2 {
            continue;
        }
        for (pid, pname) in entries {
            let other_projects: Vec<&str> = entries
                .iter()
                .filter(|(other_pid, _)| other_pid != pid)
                .map(|(_, other_name)| other_name.as_str())
                .collect();
            // Only add if not already flagged as a duplicate-value for this key+project
            let already_flagged = issues.iter().any(|i| {
                i.key == *key && i.project_id == *pid && i.issue_type == "duplicate"
            });
            if !already_flagged {
                issues.push(HealthIssue {
                    key: key.clone(),
                    project_id: pid.clone(),
                    project_name: pname.clone(),
                    issue_type: "overlap".to_string(),
                    severity: "info".to_string(),
                    details: format!("Key also exists in: {}", other_projects.join(", ")),
                });
            }
        }
    }

    // Git exposure: load cached scan results
    let git_scan_path = format!("{}/git-scan.json", state.stash_dir);
    if let Ok(content) = std::fs::read_to_string(&git_scan_path) {
        if let Ok(cache) = serde_json::from_str::<GitScanCache>(&content) {
            for exposure in &cache.exposures {
                issues.push(HealthIssue {
                    key: exposure.key.clone(),
                    project_id: exposure.project_id.clone(),
                    project_name: exposure.project_name.clone(),
                    issue_type: "git_exposed".to_string(),
                    severity: "critical".to_string(),
                    details: format!(
                        "Found in commit {} by {}",
                        &exposure.commit_hash[..7.min(exposure.commit_hash.len())],
                        exposure.author
                    ),
                });
            }
        }
    }

    // Sort: critical first, then warning, then info
    issues.sort_by(|a, b| {
        let severity_ord = |s: &str| match s {
            "critical" => 0,
            "warning" => 1,
            "info" => 2,
            _ => 3,
        };
        severity_ord(&a.severity).cmp(&severity_ord(&b.severity))
    });

    let summary = HealthSummary {
        total: issues.len() as u32,
        critical: issues.iter().filter(|i| i.severity == "critical").count() as u32,
        warning: issues.iter().filter(|i| i.severity == "warning").count() as u32,
        info: issues.iter().filter(|i| i.severity == "info").count() as u32,
    };

    HealthReport { issues, summary }
}

#[tauri::command]
pub fn scan_git_history(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<GitExposure>, String> {
    let projects = state.projects.lock().map_err(|_| "Lock poisoned")?;
    let project = projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;
    let project_path = project.path.clone();
    let project_name = project.name.clone();
    let project_id = project.id.clone();
    drop(projects);

    // Check if project is a git repo
    let git_dir = std::path::Path::new(&project_path).join(".git");
    if !git_dir.exists() {
        return Ok(Vec::new());
    }

    // Run git log looking for added lines containing potential secrets
    let output = std::process::Command::new("git")
        .args([
            "log",
            "--all",
            "-p",
            "--diff-filter=A",
            "--no-color",
            "--max-count=200",
        ])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut exposures: Vec<GitExposure> = Vec::new();

    let mut current_hash = String::new();
    let mut current_author = String::new();
    let mut current_date = String::new();
    let mut in_env_file = false;

    for line in stdout.lines() {
        if let Some(hash) = line.strip_prefix("commit ") {
            current_hash = hash.trim().to_string();
            in_env_file = false;
        } else if let Some(author) = line.strip_prefix("Author: ") {
            current_author = author.trim().to_string();
        } else if let Some(date) = line.strip_prefix("Date:") {
            current_date = date.trim().to_string();
        } else if line.starts_with("diff --git") {
            // Track whether we're in an env file diff
            in_env_file = line.contains(".env") || line.contains(".stash");
        } else if in_env_file {
            if let Some(added_line) = line.strip_prefix('+') {
                if added_line.starts_with("++") {
                    continue;
                }
                let trimmed = added_line.trim();
                // Look for KEY=VALUE patterns with secret-like values
                if let Some(eq_pos) = trimmed.find('=') {
                    let key = &trimmed[..eq_pos];
                    let value = &trimmed[eq_pos + 1..];
                    let clean_value = value.trim_matches(|c| c == '"' || c == '\'');

                    if is_potential_secret(key, clean_value) {
                        let already_found = exposures
                            .iter()
                            .any(|e| e.key == key && e.commit_hash == current_hash);
                        if !already_found {
                            exposures.push(GitExposure {
                                key: key.to_string(),
                                commit_hash: current_hash.clone(),
                                commit_date: current_date.clone(),
                                author: current_author.clone(),
                                project_id: project_id.clone(),
                                project_name: project_name.clone(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Cache results
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Load existing cache and merge
    let cache_path = format!("{}/git-scan.json", state.stash_dir);
    let mut all_exposures: Vec<GitExposure> = if let Ok(content) = std::fs::read_to_string(&cache_path)
    {
        serde_json::from_str::<GitScanCache>(&content)
            .map(|c| c.exposures)
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    // Remove old entries for this project, add new ones
    all_exposures.retain(|e| e.project_id != project_id);
    all_exposures.extend(exposures.clone());

    let cache = GitScanCache {
        exposures: all_exposures,
        scanned_at: now,
    };
    if let Ok(json) = serde_json::to_string_pretty(&cache) {
        std::fs::write(&cache_path, json).ok();
    }

    Ok(exposures)
}

/// Scan a single project's git history (extracted logic for reuse).
fn scan_project_git(
    project: &Project,
    _stash_dir: &str,
) -> Vec<GitExposure> {
    let git_dir = Path::new(&project.path).join(".git");
    if !git_dir.exists() {
        return Vec::new();
    }

    let output = match std::process::Command::new("git")
        .args(["log", "--all", "-p", "--diff-filter=A", "--no-color", "--max-count=200"])
        .current_dir(&project.path)
        .output()
    {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut exposures: Vec<GitExposure> = Vec::new();
    let mut current_hash = String::new();
    let mut current_author = String::new();
    let mut current_date = String::new();
    let mut in_env_file = false;

    for line in stdout.lines() {
        if let Some(hash) = line.strip_prefix("commit ") {
            current_hash = hash.trim().to_string();
            in_env_file = false;
        } else if let Some(author) = line.strip_prefix("Author: ") {
            current_author = author.trim().to_string();
        } else if let Some(date) = line.strip_prefix("Date:") {
            current_date = date.trim().to_string();
        } else if line.starts_with("diff --git") {
            in_env_file = line.contains(".env") || line.contains(".stash");
        } else if in_env_file {
            if let Some(added_line) = line.strip_prefix('+') {
                if added_line.starts_with("++") { continue; }
                let trimmed = added_line.trim();
                if let Some(eq_pos) = trimmed.find('=') {
                    let key = &trimmed[..eq_pos];
                    let value = &trimmed[eq_pos + 1..];
                    let clean_value = value.trim_matches(|c| c == '"' || c == '\'');
                    if is_potential_secret(key, clean_value) {
                        let already_found = exposures.iter().any(|e| e.key == key && e.commit_hash == current_hash);
                        if !already_found {
                            exposures.push(GitExposure {
                                key: key.to_string(),
                                commit_hash: current_hash.clone(),
                                commit_date: current_date.clone(),
                                author: current_author.clone(),
                                project_id: project.id.clone(),
                                project_name: project.name.clone(),
                            });
                        }
                    }
                }
            }
        }
    }

    exposures
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct GitScanProgress {
    pub current_project: String,
    pub project_index: u32,
    pub total_projects: u32,
    pub complete: bool,
}

/// Scan all projects' git history on a background thread with progress events.
#[tauri::command]
pub fn scan_all_git(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let projects: Vec<Project> = state.projects.lock()
        .map(|p| p.clone())
        .unwrap_or_default();
    let stash_dir = state.stash_dir.clone();

    std::thread::spawn(move || {
        let total = projects.len() as u32;
        let mut all_exposures: Vec<GitExposure> = Vec::new();

        for (i, project) in projects.iter().enumerate() {
            // Emit progress BEFORE scanning so UI shows current project
            let _ = app.emit("git-scan-progress", GitScanProgress {
                current_project: project.name.clone(),
                project_index: i as u32,
                total_projects: total,
                complete: false,
            });

            // Small delay so UI can render the progress update
            std::thread::sleep(std::time::Duration::from_millis(100));

            let exposures = scan_project_git(project, &stash_dir);
            all_exposures.extend(exposures);
        }

        // Save cache
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let cache = GitScanCache { exposures: all_exposures, scanned_at: now };
        let cache_path = format!("{}/git-scan.json", stash_dir);
        if let Ok(json) = serde_json::to_string_pretty(&cache) {
            std::fs::write(&cache_path, json).ok();
        }

        // Emit completion
        let _ = app.emit("git-scan-progress", GitScanProgress {
            current_project: String::new(),
            project_index: total,
            total_projects: total,
            complete: true,
        });
    });

    Ok(())
}

/// Check if a key looks like an env var name (UPPER_SNAKE_CASE).
fn looks_like_env_key(key: &str) -> bool {
    if key.is_empty() || key.len() > 60 {
        return false;
    }
    // Must start with a letter, contain only uppercase letters, digits, underscores
    let trimmed = key.trim();
    trimmed.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
        && trimmed.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false)
}

/// Check if a key-value pair looks like a potential secret in git history.
fn is_potential_secret(key: &str, value: &str) -> bool {
    // Key must look like an env var (UPPER_SNAKE_CASE)
    if !looks_like_env_key(key) {
        return false;
    }

    // Value must be substantial
    if value.len() < 12 {
        return false;
    }

    let upper_key = key.to_uppercase();

    // Known secret key patterns
    if upper_key.contains("SECRET")
        || upper_key.contains("PASSWORD")
        || upper_key.contains("API_KEY")
        || upper_key.contains("PRIVATE_KEY")
        || upper_key.ends_with("_TOKEN")
        || upper_key.ends_with("_AUTH")
        || upper_key.ends_with("_KEY")
    {
        return true;
    }

    // Known secret value patterns
    if value.starts_with("AKIA")
        || value.starts_with("sk_live_")
        || value.starts_with("sk_test_")
        || value.starts_with("ghp_")
        || value.starts_with("gho_")
        || value.starts_with("ghs_")
        || value.starts_with("github_pat_")
    {
        return true;
    }

    false
}

#[tauri::command]
pub fn get_git_scan_results(state: tauri::State<'_, AppState>) -> Vec<GitExposure> {
    let cache_path = format!("{}/git-scan.json", state.stash_dir);
    std::fs::read_to_string(&cache_path)
        .ok()
        .and_then(|content| serde_json::from_str::<GitScanCache>(&content).ok())
        .map(|c| c.exposures)
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_key_expiry(
    state: tauri::State<'_, AppState>,
    project_id: String,
    key: String,
    expiry_timestamp: u64,
) -> Result<(), String> {
    if expiry_timestamp == 0 {
        state.remove_expiry(&project_id, &key);
    } else {
        state.set_expiry(&project_id, &key, expiry_timestamp);
    }
    Ok(())
}

#[tauri::command]
pub fn get_key_expiry(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> HashMap<String, u64> {
    let prefix = format!("{}:", project_id);
    state
        .expiry
        .lock()
        .map(|expiry| {
            expiry
                .iter()
                .filter(|(k, _)| k.starts_with(&prefix))
                .map(|(k, v)| (k[prefix.len()..].to_string(), *v))
                .collect()
        })
        .unwrap_or_default()
}

// ── Git status commands ───────────────────────────────────

#[derive(serde::Serialize, Clone, Debug)]
pub struct GitStatus {
    pub is_git_repo: bool,
    pub env_tracked: bool,
    pub env_in_gitignore: bool,
}

#[tauri::command]
pub fn check_git_status(project_path: String) -> GitStatus {
    let path = Path::new(&project_path);

    let is_git_repo = path.join(".git").exists();
    if !is_git_repo {
        return GitStatus {
            is_git_repo: false,
            env_tracked: false,
            env_in_gitignore: false,
        };
    }

    // Check if .env is tracked in git
    let env_tracked = std::process::Command::new("git")
        .args(["ls-files", "--error-unmatch", ".env"])
        .current_dir(&project_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Check if .env is in .gitignore
    let gitignore_path = path.join(".gitignore");
    let env_in_gitignore = if gitignore_path.exists() {
        std::fs::read_to_string(&gitignore_path)
            .map(|content| {
                content.lines().any(|line| {
                    let trimmed = line.trim();
                    trimmed == ".env" || trimmed == ".env*" || trimmed == "*.env"
                })
            })
            .unwrap_or(false)
    } else {
        false
    };

    GitStatus {
        is_git_repo,
        env_tracked,
        env_in_gitignore,
    }
}

#[tauri::command]
pub fn fix_gitignore(project_path: String) -> Result<(), String> {
    let gitignore_path = Path::new(&project_path).join(".gitignore");

    if gitignore_path.exists() {
        let content = std::fs::read_to_string(&gitignore_path)
            .map_err(|e| format!("Failed to read .gitignore: {}", e))?;
        if content.lines().any(|l| l.trim() == ".env*" || l.trim() == ".env") {
            return Ok(());
        }
        let separator = if content.ends_with('\n') { "" } else { "\n" };
        let updated = format!("{}{}\n# Environment files\n.env*\n", content, separator);
        std::fs::write(&gitignore_path, updated)
            .map_err(|e| format!("Failed to write .gitignore: {}", e))?;
    } else {
        std::fs::write(&gitignore_path, "# Environment files\n.env*\n")
            .map_err(|e| format!("Failed to create .gitignore: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn remove_env_from_git(project_path: String) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["rm", "--cached", ".env"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git rm --cached .env failed: {}", stderr));
    }

    Ok(())
}
