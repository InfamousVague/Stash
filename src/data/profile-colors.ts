/** Default color mapping for common environment profile names */
const DEFAULT_PROFILE_COLORS: Record<string, string> = {
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

/** Color presets available in the picker (matches @base/primitives/color-picker defaults) */
export const PROFILE_COLOR_PRESETS = [
  '#EF4444', '#F59E0B', '#22C55E', '#3B82F6',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  '#14B8A6', '#6366F1', '#A855F7', '#E11D48',
];

/**
 * Get a profile's color, checking custom overrides first,
 * then falling back to well-known names, then to a default gray.
 */
export function getProfileColor(profile: string, customColors?: Record<string, string>): string {
  // Custom override from lock file metadata takes priority
  if (customColors?.[profile]) {
    return customColors[profile];
  }
  return DEFAULT_PROFILE_COLORS[profile.toLowerCase()] || '#6b7280';
}

export function getProfileStyle(profile: string, customColors?: Record<string, string>): React.CSSProperties {
  const color = getProfileColor(profile, customColors);
  return {
    color,
    backgroundColor: `${color}15`,
    borderColor: `${color}30`,
    borderWidth: '1px',
    borderStyle: 'solid',
  };
}
