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
    local_only: false,
  },
  {
    id: 'proj-2',
    name: 'Backend API',
    path: '/Users/test/Development/backend-api',
    framework: 'express',
    active_profile: 'default',
    profiles: ['default', 'development'],
    local_only: false,
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
