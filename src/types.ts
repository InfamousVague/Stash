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

export interface Contact {
  name: string;
  public_key: string;
  added_at: number;
}
