/**
 * Tauri IPC mock for Playwright E2E tests.
 * Injected via page.addInitScript() to intercept invoke() calls
 * when running against the Vite dev server without the Rust backend.
 */

export const MOCK_PROJECTS = [
  {
    id: 'proj-1',
    name: 'nextjs-app',
    path: '/Users/test/projects/nextjs-app',
    framework: 'next',
    active_profile: 'default',
    profiles: ['default', 'production', 'staging'],
  },
  {
    id: 'proj-2',
    name: 'express-api',
    path: '/Users/test/projects/express-api',
    framework: 'express',
    active_profile: 'default',
    profiles: ['default', 'production'],
  },
];

export const MOCK_VARS = [
  { key: 'DATABASE_URL', value: 'postgres://localhost:5432/mydb' },
  { key: 'API_KEY', value: 'sk_test_abc123def456' },
  { key: 'PORT', value: '3000' },
  { key: 'NODE_ENV', value: 'development' },
  { key: 'JWT_SECRET', value: 'super-secret-jwt-key-here' },
];

export const MOCK_HEALTH_REPORT = {
  issues: [
    {
      key: 'API_KEY',
      project_id: 'proj-1',
      project_name: 'nextjs-app',
      issue_type: 'stale',
      severity: 'warning',
      details: 'Not rotated in 45 days',
    },
    {
      key: 'DATABASE_URL',
      project_id: 'proj-1',
      project_name: 'nextjs-app',
      issue_type: 'duplicate',
      severity: 'warning',
      details: 'Same value found in: express-api',
    },
    {
      key: 'PORT',
      project_id: 'proj-2',
      project_name: 'express-api',
      issue_type: 'format',
      severity: 'info',
      details: 'Value has trailing whitespace',
    },
  ],
  summary: { total: 3, critical: 0, warning: 2, info: 1 },
};

export const MOCK_SCAN_RESULTS = [
  {
    project_name: 'nextjs-app',
    project_path: '/Users/test/projects/nextjs-app',
    env_files: [
      { path: '/Users/test/projects/nextjs-app/.env', filename: '.env', file_type: 'root' },
      { path: '/Users/test/projects/nextjs-app/.env.production', filename: '.env.production', file_type: 'production' },
    ],
    framework: 'next',
  },
  {
    project_name: 'unimported-project',
    project_path: '/Users/test/projects/unimported',
    env_files: [
      { path: '/Users/test/projects/unimported/.env', filename: '.env', file_type: 'root' },
    ],
    framework: 'react',
  },
];

/**
 * Returns the script to inject into the page that mocks Tauri IPC.
 * State is managed via closure to simulate unlock flow.
 */
export function getTauriMockScript(): string {
  return `
    (() => {
      let vaultUnlocked = false;
      let setupComplete = true;

      const PROJECTS = ${JSON.stringify(MOCK_PROJECTS)};
      const VARS = ${JSON.stringify(MOCK_VARS)};
      const HEALTH = ${JSON.stringify(MOCK_HEALTH_REPORT)};
      const SCAN_RESULTS = ${JSON.stringify(MOCK_SCAN_RESULTS)};

      const handlers = {
        check_vault_initialized: () => true,
        check_vault_unlocked: () => vaultUnlocked,
        is_setup_complete: () => setupComplete,
        has_keychain_key: () => false,

        init_vault_cmd: () => { vaultUnlocked = true; },
        unlock_vault_cmd: (args) => {
          if (args?.password === 'wrong') throw new Error('Incorrect password');
          vaultUnlocked = true;
        },
        lock_vault: () => { vaultUnlocked = false; },

        list_projects: () => PROJECTS,
        get_project_vars: () => VARS,
        get_rotation_info: () => ({}),
        get_key_expiry: () => ({}),
        import_project: (args) => ({
          id: 'proj-new',
          name: args?.projectName || 'new-project',
          path: args?.projectPath || '/tmp/new',
          framework: null,
          active_profile: 'default',
          profiles: ['default'],
        }),
        delete_project: () => {},

        update_var: () => {},
        add_var: () => {},
        delete_var: () => {},
        set_key_expiry: () => {},
        get_var_history: () => [],
        generate_env_file: () => {},
        find_project_icon: () => null,
        get_project_profile_vars: () => VARS,

        list_profiles: () => ['default', 'production', 'staging'],
        get_active_profile: () => 'default',
        switch_profile: () => {},
        create_profile: () => {},
        delete_profile: () => {},
        diff_profiles: () => [],

        get_health_report: () => HEALTH,
        scan_git_history: () => [],
        get_git_scan_results: () => [],
        check_git_status: () => ({ is_git_repo: true, env_tracked: false, env_in_gitignore: true }),
        fix_gitignore: () => {},
        remove_env_from_git: () => {},

        start_scan: () => {},
        get_scan_results: () => SCAN_RESULTS,
        cancel_scan: () => {},

        check_cli_installed: () => true,
        install_cli: () => {},

        get_config: () => ({ scan_directories: [], setup_complete: true }),
        save_config_cmd: () => {},
        complete_setup: () => { setupComplete = true; },
        get_suggested_directories: () => ['/Users/test/projects'],
        get_scan_directories: () => ['/Users/test/projects'],

        store_key_in_keychain: () => {},
        unlock_vault_from_keychain: () => { vaultUnlocked = true; },
        clear_keychain_key: () => {},

        generate_team_key: () => 'mock-public-key',
        get_public_key: () => 'mock-public-key',
        push_lock: () => {},
        pull_lock: () => VARS,
        add_team_member: () => {},
        remove_team_member: () => {},
        list_team_members: () => [],
        list_all_team_members: () => [],

        // Contacts
        list_contacts: () => [],
        add_contact: () => {},
        remove_contact: () => {},
        generate_share_link: (args) => 'stash://add-contact?name=' + encodeURIComponent(args?.name || '') + '&key=' + (args?.publicKey || ''),

        // Saved Keys
        list_saved_keys: () => [],
        add_saved_key: (args) => ({ id: 'key-1', service_id: args?.serviceId || '', service_name: args?.serviceName || '', env_key: args?.envKey || '', value: '***', notes: '', created_at: Math.floor(Date.now() / 1000) }),
        update_saved_key: () => {},
        delete_saved_key: () => {},
        get_saved_key_value: () => 'mock-api-key-value',

        // Misc
        scan_all_git: () => [],
        is_biometric_available: () => false,
      };

      // Intercept Tauri IPC
      window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
      const originalInvoke = window.__TAURI_INTERNALS__.invoke;

      window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
        // Tauri plugin commands use plugin:name|command format
        if (cmd.startsWith('plugin:')) {
          // plugin:updater|check, plugin:deep-link|on_open_url, etc.
          console.log('[tauri-mock] Plugin command (no-op):', cmd);
          return null;
        }
        const handler = handlers[cmd];
        if (handler) {
          const result = handler(args);
          return result;
        }
        console.warn('[tauri-mock] Unhandled command:', cmd, args);
        return null;
      };

      // Mock event listener and other Tauri internals
      window.__TAURI_INTERNALS__.listen = window.__TAURI_INTERNALS__.listen || (async () => () => {});
      window.__TAURI_INTERNALS__.emit = window.__TAURI_INTERNALS__.emit || (async () => {});
      window.__TAURI_INTERNALS__.transformCallback = window.__TAURI_INTERNALS__.transformCallback || ((cb) => {
        const id = Math.random().toString(36).slice(2);
        window['_' + id] = cb;
        return id;
      });
    })();
  `;
}
