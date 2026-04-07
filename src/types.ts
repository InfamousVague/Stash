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
