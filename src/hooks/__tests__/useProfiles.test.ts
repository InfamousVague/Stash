import { renderHook, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useProfiles } from '../useProfiles';

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'list_profiles') return Promise.resolve(['default', 'staging', 'production']);
    if (cmd === 'get_active_profile') return Promise.resolve('default');
    if (cmd === 'switch_profile') return Promise.resolve();
    if (cmd === 'create_profile') return Promise.resolve();
    return Promise.resolve();
  });
});

describe('useProfiles', () => {
  it('loadProfiles calls invoke and sets state', async () => {
    const { result } = renderHook(() => useProfiles());

    await act(async () => {
      await result.current.loadProfiles('proj-1');
    });

    expect(invoke).toHaveBeenCalledWith('list_profiles', { projectId: 'proj-1' });
    expect(invoke).toHaveBeenCalledWith('get_active_profile', { projectId: 'proj-1' });
    expect(result.current.profiles).toEqual(['default', 'staging', 'production']);
    expect(result.current.activeProfile).toBe('default');
  });

  it('switchProfile calls invoke and sets active', async () => {
    const { result } = renderHook(() => useProfiles());

    await act(async () => {
      await result.current.switchProfile('proj-1', 'staging');
    });

    expect(invoke).toHaveBeenCalledWith('switch_profile', {
      projectId: 'proj-1',
      profileName: 'staging',
    });
    expect(result.current.activeProfile).toBe('staging');
  });

  it('createProfile calls invoke', async () => {
    const { result } = renderHook(() => useProfiles());

    await act(async () => {
      await result.current.createProfile('proj-1', 'new-profile', false, 'default');
    });

    expect(invoke).toHaveBeenCalledWith('create_profile', {
      projectId: 'proj-1',
      name: 'new-profile',
      copyFrom: 'default',
      copyValues: false,
    });
  });
});
