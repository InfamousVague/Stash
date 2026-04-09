/** Color mapping for environment profile names */
const PROFILE_COLORS: Record<string, string> = {
  production: '#ef4444',
  prod: '#ef4444',
  staging: '#f59e0b',
  stage: '#f59e0b',
  development: '#22c55e',
  dev: '#22c55e',
  local: '#3b82f6',
  test: '#8b5cf6',
  default: '#6b7280',
};

export function getProfileColor(profile: string): string {
  return PROFILE_COLORS[profile.toLowerCase()] || '#6b7280';
}

export function getProfileStyle(profile: string): React.CSSProperties {
  const color = getProfileColor(profile);
  return {
    color,
    backgroundColor: `${color}15`,
    borderColor: `${color}30`,
    borderWidth: '1px',
    borderStyle: 'solid',
  };
}
