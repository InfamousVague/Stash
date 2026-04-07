import { vi } from 'vitest';
import type { Project, EnvVar, EnvFileGroup, ApiService, ScanProgress } from '../types';

// --- Sample test data ---

export const mockProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'My App',
    path: '/Users/test/Development/my-app',
    framework: 'next',
    active_profile: 'default',
    profiles: ['default', 'staging', 'production'],
  },
  {
    id: 'proj-2',
    name: 'Backend API',
    path: '/Users/test/Development/backend-api',
    framework: 'express',
    active_profile: 'default',
    profiles: ['default', 'development'],
  },
];

export const mockEnvVars: EnvVar[] = [
  { key: 'OPENAI_API_KEY', value: 'sk-test-123' },
  { key: 'DATABASE_URL', value: 'postgres://localhost:5432/mydb' },
  { key: 'NEXT_PUBLIC_API_URL', value: 'http://localhost:3000' },
  { key: 'JWT_SECRET', value: 'super-secret-key' },
];

export const mockScanResults: EnvFileGroup[] = [
  {
    project_name: 'my-app',
    project_path: '/Users/test/Development/my-app',
    env_files: [
      { path: '/Users/test/Development/my-app/.env', filename: '.env', file_type: 'env' },
      { path: '/Users/test/Development/my-app/.env.local', filename: '.env.local', file_type: 'env' },
    ],
    framework: 'next',
  },
  {
    project_name: 'backend-api',
    project_path: '/Users/test/Development/backend-api',
    env_files: [
      { path: '/Users/test/Development/backend-api/.env', filename: '.env', file_type: 'env' },
    ],
    framework: 'express',
  },
];

export const mockScanProgress: ScanProgress = {
  directories_scanned: 42,
  files_found: 5,
  current_dir: '/Users/test/Development/my-app',
  complete: false,
};

export const mockApiService: ApiService = {
  id: 'openai',
  name: 'OpenAI',
  category: 'AI & ML',
  description: 'GPT-4, DALL-E, Whisper, and embeddings APIs',
  envKeys: ['OPENAI_API_KEY', 'OPENAI_ORG_ID'],
  portalUrl: 'https://platform.openai.com/api-keys',
};

export const mockApiServices: ApiService[] = [
  mockApiService,
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Payments',
    description: 'Payment processing and billing platform',
    envKeys: ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    portalUrl: 'https://dashboard.stripe.com/apikeys',
  },
  {
    id: 'aws',
    name: 'AWS',
    category: 'Cloud',
    description: 'Amazon Web Services cloud platform',
    envKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    portalUrl: 'https://console.aws.amazon.com/iam',
  },
];

// --- Mock invoke helper ---

type InvokeHandler = (cmd: string, args?: Record<string, unknown>) => unknown;

const defaultHandlers: Record<string, (...args: unknown[]) => unknown> = {
  check_vault_initialized: () => true,
  check_vault_unlocked: () => false,
  init_vault_cmd: () => undefined,
  unlock_vault_cmd: () => undefined,
  lock_vault: () => undefined,
  list_projects: () => mockProjects,
  import_project: () => undefined,
  get_project_vars: () => mockEnvVars,
  get_rotation_info: () => ({}),
  update_var: () => undefined,
  add_var: () => undefined,
  delete_var: () => undefined,
  delete_project: () => undefined,
  list_profiles: () => ['default', 'staging', 'production'],
  get_active_profile: () => 'default',
  switch_profile: () => undefined,
  create_profile: () => undefined,
  start_scan: () => undefined,
  get_scan_results: () => mockScanResults,
  get_public_key: () => 'test-public-key-abc123',
  generate_team_key: () => 'generated-key-xyz789',
  list_team_members: () => [{ name: 'Alice', public_key: 'key-alice' }],
  add_team_member: () => undefined,
  remove_team_member: () => undefined,
  push_lock: () => undefined,
  pull_lock: () => undefined,
  diff_profiles: () => [],
  check_cli_installed: () => false,
  install_cli: () => undefined,
};

/**
 * Set up the invoke mock with default or custom handlers.
 * Call with overrides to customise specific commands.
 */
export function setupInvokeMock(overrides: Partial<Record<string, InvokeHandler>> = {}) {
  const { invoke } = vi.mocked(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@tauri-apps/api/core') as { invoke: InvokeHandler }
  );

  const handlers = { ...defaultHandlers, ...overrides };

  (invoke as ReturnType<typeof vi.fn>).mockImplementation(
    (cmd: string, args?: Record<string, unknown>) => {
      const handler = handlers[cmd];
      if (handler) return Promise.resolve(handler(cmd, args));
      return Promise.reject(new Error(`Unhandled invoke command: ${cmd}`));
    }
  );

  return invoke;
}
