/** Common env vars suggested per framework when a project is imported */
export const FRAMEWORK_SUGGESTIONS: Record<string, string[]> = {
  next: [
    'NEXT_PUBLIC_API_URL',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'DATABASE_URL',
    'NEXT_PUBLIC_SITE_URL',
  ],
  react: [
    'VITE_API_URL',
    'VITE_PUBLIC_URL',
    'REACT_APP_API_URL',
  ],
  vue: [
    'VITE_API_URL',
    'VITE_APP_TITLE',
    'VUE_APP_API_URL',
  ],
  angular: [
    'NG_APP_API_URL',
    'NG_APP_ENV',
  ],
  express: [
    'PORT',
    'NODE_ENV',
    'DATABASE_URL',
    'JWT_SECRET',
    'CORS_ORIGIN',
    'SESSION_SECRET',
  ],
  rails: [
    'RAILS_ENV',
    'SECRET_KEY_BASE',
    'DATABASE_URL',
    'REDIS_URL',
    'RAILS_MASTER_KEY',
  ],
  python: [
    'FLASK_ENV',
    'FLASK_SECRET_KEY',
    'DJANGO_SECRET_KEY',
    'DJANGO_SETTINGS_MODULE',
    'DATABASE_URL',
    'CELERY_BROKER_URL',
  ],
  laravel: [
    'APP_KEY',
    'APP_ENV',
    'APP_URL',
    'DB_CONNECTION',
    'DB_HOST',
    'DB_DATABASE',
    'DB_USERNAME',
    'DB_PASSWORD',
    'MAIL_MAILER',
  ],
  rust: [
    'DATABASE_URL',
    'RUST_LOG',
    'BIND_ADDRESS',
  ],
  go: [
    'PORT',
    'DATABASE_URL',
    'GIN_MODE',
    'LOG_LEVEL',
  ],
};

export function getSuggestions(framework: string | null, existingKeys: string[]): string[] {
  if (!framework) return [];
  const suggestions = FRAMEWORK_SUGGESTIONS[framework] || [];
  return suggestions.filter((s) => !existingKeys.includes(s));
}
