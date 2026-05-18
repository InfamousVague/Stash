import * as SecureStore from 'expo-secure-store';
import type {
  Project,
  ProjectsResponse,
  Profile,
  ProfilesResponse,
  VariablesResponse,
  Workspace,
  DeviceKeysResponse,
  SwitchStatus,
  LinkedDevicesResponse,
} from '../types/models';

const RELAY_URL = 'https://stash.mattssoftware.com';
const TOKEN_KEY = 'stash_token';
const DEVICE_ID_KEY = 'stash_device_id';
const PRIVATE_KEY_KEY = 'stash_private_key';
const PUBLIC_KEY_KEY = 'stash_public_key';

class APIClient {
  private token: string = '';
  private _configured: boolean = false;

  async initialize(): Promise<boolean> {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) {
      this.token = token;
      this._configured = true;
      return true;
    }
    return false;
  }

  get isConfigured(): boolean {
    return this._configured;
  }

  // ── Auth ──────────────────────────────────────────────────────────────

  async signInWithApple(
    identityToken: string,
    userIdentifier: string,
    email?: string,
  ): Promise<string> {
    console.log('[API] POST /auth/apple, email:', email, 'user:', userIdentifier?.substring(0, 12));
    const res = await fetch(`${RELAY_URL}/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity_token: identityToken,
        user_identifier: userIdentifier,
        email: email ?? '',
      }),
    });
    console.log('[API] /auth/apple response status:', res.status);
    if (!res.ok) {
      const body = await res.text();
      console.error('[API] /auth/apple error body:', body);
      throw new APIError(res.status, body);
    }
    const data = await res.json();
    console.log('[API] Got token, length:', data.token?.length);
    this.token = data.token;
    this._configured = true;
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    return data.token;
  }

  async devSetToken(token: string): Promise<void> {
    this.token = token;
    this._configured = true;
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }

  async signOut(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
    await SecureStore.deleteItemAsync(PRIVATE_KEY_KEY);
    await SecureStore.deleteItemAsync(PUBLIC_KEY_KEY);
    this.token = '';
    this._configured = false;
  }

  async deleteAccount(): Promise<void> {
    await this.del('/auth/user');
    await this.signOut();
  }

  // ── Device Keys ───────────────────────────────────────────────────────

  async getDeviceId(): Promise<string | null> {
    return SecureStore.getItemAsync(DEVICE_ID_KEY);
  }

  async setDeviceId(id: string): Promise<void> {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }

  async getPrivateKey(): Promise<string | null> {
    return SecureStore.getItemAsync(PRIVATE_KEY_KEY);
  }

  async setKeypair(privateKey: string, publicKey: string): Promise<void> {
    await SecureStore.setItemAsync(PRIVATE_KEY_KEY, privateKey);
    await SecureStore.setItemAsync(PUBLIC_KEY_KEY, publicKey);
  }

  async getPublicKey(): Promise<string | null> {
    return SecureStore.getItemAsync(PUBLIC_KEY_KEY);
  }

  async uploadDeviceKey(
    deviceId: string,
    publicKey: string,
    deviceType: string,
    label?: string,
  ): Promise<void> {
    await this.post('/auth/device-key', {
      device_id: deviceId,
      public_key: publicKey,
      device_type: deviceType,
      label: label ?? undefined,
    });
  }

  // ── Workspaces (Mac devices) ──────────────────────────────────────────

  async getWorkspaces(): Promise<Workspace[]> {
    const data: DeviceKeysResponse = await this.get('/auth/device-keys');
    return data.devices.filter((d) => d.device_type === 'mac');
  }

  async getLinkedDevices(): Promise<Workspace[]> {
    const data: DeviceKeysResponse = await this.get('/auth/device-keys');
    return data.devices;
  }

  // ── Projects ──────────────────────────────────────────────────────────

  async listProjects(sourceDeviceId?: string): Promise<Project[]> {
    const params = sourceDeviceId ? `?source_device_id=${sourceDeviceId}` : '';
    const data = await this.get<Project[] | ProjectsResponse>(`/projects${params}`);
    // Relay returns a plain array, not wrapped in { projects: [...] }
    return Array.isArray(data) ? data : data.projects;
  }

  async listProfiles(projectId: string): Promise<Profile[]> {
    const data: ProfilesResponse = await this.get(`/projects/${projectId}/profiles`);
    return data.profiles;
  }

  async listVariables(projectId: string, profile?: string): Promise<VariablesResponse> {
    const path = profile
      ? `/projects/${projectId}/vars/${encodeURIComponent(profile)}`
      : `/projects/${projectId}/vars`;
    return this.get(path);
  }

  async switchProfile(projectId: string, profile: string): Promise<SwitchStatus> {
    return this.post(`/projects/${projectId}/switch`, { profile });
  }

  // ── Health ────────────────────────────────────────────────────────────

  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.get('/health');
  }

  // ── Private HTTP helpers ──────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${RELAY_URL}${path}`, { headers: this.headers() });
    if (!res.ok) throw new APIError(res.status, await res.text());
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${RELAY_URL}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new APIError(res.status, await res.text());
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text);
  }

  private async del<T>(path: string): Promise<T> {
    const res = await fetch(`${RELAY_URL}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw new APIError(res.status, await res.text());
    return undefined as any;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }
}

export class APIError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`API Error ${status}: ${body}`);
  }
}

export const api = new APIClient();
