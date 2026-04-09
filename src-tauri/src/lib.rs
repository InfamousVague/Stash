pub mod scanner;
pub mod env_parser;
pub mod profile_manager;
pub mod vault;
pub mod team;
pub mod session;
pub mod config;
pub mod state;
mod commands;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            commands::projects::get_project_profile_vars,
            commands::projects::generate_env_file,
            commands::projects::get_var_history,
            commands::projects::find_project_icon,
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
            commands::vault::store_key_in_keychain,
            commands::vault::unlock_vault_from_keychain,
            commands::vault::has_keychain_key,
            commands::vault::is_biometric_available,
            commands::vault::clear_keychain_key,
            // Team commands
            commands::team::generate_team_key,
            commands::team::get_public_key,
            commands::team::push_lock,
            commands::team::pull_lock,
            commands::team::add_team_member,
            commands::team::remove_team_member,
            commands::team::list_team_members,
            commands::team::list_all_team_members,
            // CLI commands
            commands::cli::check_cli_installed,
            commands::cli::install_cli,
            // Config commands
            commands::config::get_config,
            commands::config::save_config_cmd,
            commands::config::is_setup_complete,
            commands::config::complete_setup,
            commands::config::get_suggested_directories,
            commands::config::get_scan_directories,
            // Health commands
            commands::health::get_health_report,
            commands::health::scan_git_history,
            commands::health::get_git_scan_results,
            commands::health::set_key_expiry,
            commands::health::get_key_expiry,
            commands::health::scan_all_git,
            commands::health::check_git_status,
            commands::health::fix_gitignore,
            commands::health::remove_env_from_git,
            // Contact commands
            commands::contacts::list_contacts,
            commands::contacts::add_contact,
            commands::contacts::remove_contact,
            commands::contacts::generate_share_link,
            // Saved keys commands
            commands::saved_keys::list_saved_keys,
            commands::saved_keys::add_saved_key,
            commands::saved_keys::update_saved_key,
            commands::saved_keys::delete_saved_key,
            commands::saved_keys::get_saved_key_value,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
