use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use walkdir::WalkDir;
use tauri::Emitter;

use crate::state::{EnvFile, EnvFileGroup, ScanProgress};

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "build", "dist", "__pycache__",
    ".venv", "vendor", "Pods", ".next", ".nuxt", ".cache", "coverage", ".cargo",
];

const ENV_FILENAMES: &[&str] = &[
    ".env", ".env.local", ".env.development", ".env.staging", ".env.production",
    ".env.example", ".env.sample", ".env.test", ".env.dev", ".env.prod",
];

fn classify_env_file(filename: &str) -> String {
    match filename {
        ".env" => "root".to_string(),
        ".env.local" => "local".to_string(),
        ".env.development" | ".env.dev" => "development".to_string(),
        ".env.staging" => "staging".to_string(),
        ".env.production" | ".env.prod" => "production".to_string(),
        ".env.example" | ".env.sample" => "example".to_string(),
        ".env.test" => "test".to_string(),
        _ => "root".to_string(),
    }
}

fn detect_framework(project_path: &Path) -> Option<String> {
    // Check package.json for JS frameworks
    let pkg_path = project_path.join("package.json");
    if pkg_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&pkg_path) {
            if content.contains("\"next\"") || content.contains("\"next/") {
                return Some("next".to_string());
            }
            if content.contains("\"@angular/core\"") {
                return Some("angular".to_string());
            }
            if content.contains("\"vue\"") {
                return Some("vue".to_string());
            }
            if content.contains("\"express\"") {
                return Some("express".to_string());
            }
            if content.contains("\"react\"") {
                return Some("react".to_string());
            }
        }
    }

    if project_path.join("Gemfile").exists() {
        return Some("rails".to_string());
    }
    if project_path.join("requirements.txt").exists() || project_path.join("pyproject.toml").exists() {
        return Some("python".to_string());
    }
    if project_path.join("composer.json").exists() {
        return Some("laravel".to_string());
    }
    if project_path.join("Cargo.toml").exists() {
        return Some("rust".to_string());
    }
    if project_path.join("go.mod").exists() {
        return Some("go".to_string());
    }

    None
}

pub fn start_scan(
    app_handle: tauri::AppHandle,
    running: Arc<AtomicBool>,
    results: Arc<Mutex<Vec<EnvFileGroup>>>,
) {
    running.store(true, Ordering::SeqCst);

    // Clear previous results
    {
        let mut r = results.lock().unwrap();
        r.clear();
    }

    let running_clone = Arc::clone(&running);
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let home = dirs::home_dir().unwrap_or_default();
        let scan_dirs = [
            "Development", "Projects", "code",
            "repos", "work", "src",
        ];

        let mut dirs_scanned: u32 = 0;
        let mut files_found: u32 = 0;
        // Map from parent directory -> list of env files found
        let mut grouped: HashMap<String, Vec<EnvFile>> = HashMap::new();

        for scan_dir in &scan_dirs {
            let root = home.join(scan_dir);
            if !root.exists() {
                continue;
            }

            let walker = WalkDir::new(&root)
                .max_depth(8)
                .follow_links(false)
                .into_iter()
                .filter_entry(|e| {
                    if !e.file_type().is_dir() {
                        return true;
                    }
                    let name = e.file_name().to_string_lossy();
                    !SKIP_DIRS.contains(&name.as_ref())
                });

            for entry in walker {
                if !running.load(Ordering::SeqCst) {
                    // Cancelled
                    let _ = app_handle.emit("scan-complete", ());
                    return;
                }

                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => continue,
                };

                if entry.file_type().is_dir() {
                    dirs_scanned += 1;

                    if dirs_scanned % 50 == 0 {
                        let progress = ScanProgress {
                            directories_scanned: dirs_scanned,
                            files_found: files_found,
                            current_dir: entry.path().to_string_lossy().to_string(),
                            complete: false,
                        };
                        let _ = app_handle.emit("scan-progress", &progress);
                    }
                    continue;
                }

                let filename = entry.file_name().to_string_lossy().to_string();
                if !ENV_FILENAMES.contains(&filename.as_str()) {
                    continue;
                }

                files_found += 1;

                let file_path = entry.path().to_string_lossy().to_string();
                let parent = entry.path().parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();

                let env_file = EnvFile {
                    path: file_path,
                    filename: filename.clone(),
                    file_type: classify_env_file(&filename),
                };

                grouped.entry(parent).or_default().push(env_file);
            }
        }

        // Build EnvFileGroup results
        let mut final_results: Vec<EnvFileGroup> = Vec::new();
        for (project_path, env_files) in grouped {
            let path = Path::new(&project_path);
            let project_name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| project_path.clone());
            let framework = detect_framework(path);

            final_results.push(EnvFileGroup {
                project_name,
                project_path,
                env_files,
                framework,
            });
        }

        final_results.sort_by(|a, b| a.project_name.to_lowercase().cmp(&b.project_name.to_lowercase()));

        {
            let mut r = results.lock().unwrap();
            *r = final_results;
        }

        running.store(false, Ordering::SeqCst);

        let progress = ScanProgress {
            directories_scanned: dirs_scanned,
            files_found: files_found,
            current_dir: String::new(),
            complete: true,
        };
        let _ = app_handle.emit("scan-progress", &progress);
        let _ = app_handle.emit("scan-complete", ());
        })); // end catch_unwind

        if result.is_err() {
            log::error!("Scanner thread panicked");
        }
        running_clone.store(false, Ordering::SeqCst);
    });
}
