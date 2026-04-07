pub mod scanner;
pub mod env_parser;
pub mod profile_manager;
pub mod vault;
pub mod team;
pub mod session;
pub mod state;
mod commands;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Scanner commands
            commands::scanner::start_scan,
            commands::scanner::get_scan_results,
            commands::scanner::cancel_scan,
            // Project commands
            commands::projects::import_project,
            commands::projects::list_projects,
            commands::projects::get_project_vars,
            commands::projects::update_var,
            commands::projects::add_var,
            commands::projects::delete_var,
            commands::projects::delete_project,
            commands::projects::get_rotation_info,
            // Profile commands
            commands::profiles::list_profiles,
            commands::profiles::get_active_profile,
            commands::profiles::switch_profile,
            commands::profiles::create_profile,
            commands::profiles::delete_profile,
            commands::profiles::diff_profiles,
            // Vault commands
            commands::vault::check_vault_initialized,
            commands::vault::check_vault_unlocked,
            commands::vault::init_vault_cmd,
            commands::vault::unlock_vault_cmd,
            commands::vault::lock_vault,
            // Team commands
            commands::team::generate_team_key,
            commands::team::get_public_key,
            commands::team::push_lock,
            commands::team::pull_lock,
            commands::team::add_team_member,
            commands::team::remove_team_member,
            commands::team::list_team_members,
            // CLI commands
            commands::cli::check_cli_installed,
            commands::cli::install_cli,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
