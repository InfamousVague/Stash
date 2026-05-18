export interface Project {
  id: string;
  source_device_id: string;
  name: string;
  path: string;
  framework?: string;
  active_profile: string;
  profiles: string[];
  variable_counts: Record<string, number>;
  health?: ProjectHealth;
}

export interface ProjectHealth {
  stale_count: number;
  expiring_count: number;
  exposed_count: number;
}

export interface Workspace {
  device_id: string;
  public_key: string;
  device_type: string;
  label?: string;
  lan_ip?: string;
  lan_port?: number;
  lan_updated_at?: string;
}

export interface DeviceKeysResponse {
  devices: Workspace[];
}

export interface Profile {
  name: string;
  variable_count: number;
}

export interface ProfilesResponse {
  profiles: Profile[];
}

export interface EnvVariable {
  key: string;
  encrypted_for: Record<string, string>;
}

export interface VariablesResponse {
  profile: string;
  variables: EnvVariable[];
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface SwitchStatus {
  id: string;
  action_type: string;
  project_id: string;
  profile: string;
}

export interface LinkedDevicesResponse {
  count: number;
}
