import { renderHook, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useTeam } from '../useTeam';

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'get_public_key') return Promise.resolve('test-public-key');
    if (cmd === 'generate_team_key') return Promise.resolve('generated-key-xyz');
    if (cmd === 'list_team_members') return Promise.resolve([
      { name: 'Alice', public_key: 'key-alice' },
    ]);
    return Promise.resolve();
  });
});

describe('useTeam', () => {
  it('generateKey calls invoke and sets publicKey', async () => {
    const { result } = renderHook(() => useTeam());

    let key: string | undefined;
    await act(async () => {
      key = await result.current.generateKey();
    });

    expect(invoke).toHaveBeenCalledWith('generate_team_key');
    expect(key).toBe('generated-key-xyz');
    expect(result.current.publicKey).toBe('generated-key-xyz');
  });

  it('loadMembers calls invoke and sets members', async () => {
    const { result } = renderHook(() => useTeam());

    await act(async () => {
      await result.current.loadMembers('proj-1');
    });

    expect(invoke).toHaveBeenCalledWith('list_team_members', { projectId: 'proj-1' });
    expect(result.current.members).toEqual([
      { name: 'Alice', public_key: 'key-alice' },
    ]);
  });

  it('pushLock calls invoke', async () => {
    const { result } = renderHook(() => useTeam());

    await act(async () => {
      await result.current.pushLock('proj-1');
    });

    expect(invoke).toHaveBeenCalledWith('push_lock', { projectId: 'proj-1' });
  });

  it('pullLock calls invoke', async () => {
    const { result } = renderHook(() => useTeam());

    await act(async () => {
      await result.current.pullLock('proj-1');
    });

    expect(invoke).toHaveBeenCalledWith('pull_lock', { projectId: 'proj-1' });
  });
});
