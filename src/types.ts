export interface ScanProgress {
  directories_scanned: number;
  files_found: number;
  current_dir: string;
  complete: boolean;
}

export interface EnvFile {
  path: string;
  filename: string;
  file_type: string;
}

export interface EnvFileGroup {
  project_name: string;
  project_path: string;
  env_files: EnvFile[];
  framework: string | null;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  framework: string | null;
  active_profile: string;
  profiles: string[];
  local_only: boolean;
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface ApiService {
  id: string;
  name: string;
  category: string;
  description: string;
  envKeys: string[];
  portalUrl: string;
}

// ── Health types ──────────────────────────────────────────

export interface HealthIssue {
  key: string;
  project_id: string;
  project_name: string;
  issue_type: 'stale' | 'duplicate' | 'format' | 'git_exposed' | 'expiring';
  severity: 'critical' | 'warning' | 'info';
  details: string;
}

export interface HealthSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

export interface HealthReport {
  issues: HealthIssue[];
  summary: HealthSummary;
}

export interface HistoryEntry {
  timestamp: number;
  action: 'created' | 'updated' | 'deleted';
  old_value: string | null;
  new_value: string | null;
}

export interface DeveloperInfo {
  name: string;
  public_key: string;
  projects: { id: string; name: string }[];
}

export interface GitExposure {
  key: string;
  commit_hash: string;
  commit_date: string;
  author: string;
  project_id: string;
  project_name: string;
}

export interface LockProfileInfo {
  name: string;
  key_count: number;
  keys: string[];
}

export interface LockFileInfo {
  version: number;
  member_count: number;
  profiles: LockProfileInfo[];
}

export interface ProfileSyncDetail {
  name: string;
  status: 'synced' | 'changed' | 'new' | 'lock_only';
  env_key_count: number;
  lock_key_count: number;
  added_keys: string[];
  removed_keys: string[];
}

export interface LockSyncStatus {
  in_sync: boolean;
  has_lock: boolean;
  member_count: number;
  version: number;
  profiles: ProfileSyncDetail[];
}

export interface Contact {
  name: string;
  public_key: string;
  added_at: number;
}

// ── Pull conflict resolution types ──────────────────────────

export interface ChangedVar {
  key: string;
  local_value: string;
  incoming_value: string;
}

export interface ProfilePullDiff {
  name: string;
  added: EnvVar[];
  removed: string[];
  changed: ChangedVar[];
  unchanged: number;
}

export interface PullPreview {
  profiles: ProfilePullDiff[];
}

// ── Lock changelog types ────────────────────────────────────

export interface ChangelogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

// ── Expiry notification types ───────────────────────────────

export interface ExpiringKeyInfo {
  project_id: string;
  project_name: string;
  key: string;
  expires_at: number;
  days_remaining: number;
}
