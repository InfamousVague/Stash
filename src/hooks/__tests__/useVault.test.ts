import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useVault } from '../useVault';

vi.mocked(invoke).mockImplementation((cmd: string) => {
  if (cmd === 'check_vault_initialized') return Promise.resolve(true);
  if (cmd === 'check_vault_unlocked') return Promise.resolve(false);
  return Promise.resolve();
});

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'check_vault_initialized') return Promise.resolve(true);
    if (cmd === 'check_vault_unlocked') return Promise.resolve(false);
    return Promise.resolve();
  });
});

describe('useVault', () => {
  it('has correct initial state', async () => {
    const { result } = renderHook(() => useVault());
    // Before effects run, initialized is null
    expect(result.current.unlocked).toBe(false);
    expect(result.current.error).toBe('');

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });
  });

  it('calls invoke with password on initVault', async () => {
    const { result } = renderHook(() => useVault());
    await waitFor(() => expect(result.current.initialized).toBe(true));

    await act(async () => {
      await result.current.initVault('my-password');
    });

    expect(invoke).toHaveBeenCalledWith('init_vault_cmd', { password: 'my-password' });
    expect(result.current.initialized).toBe(true);
    expect(result.current.unlocked).toBe(true);
  });

  it('calls invoke on unlock', async () => {
    const { result } = renderHook(() => useVault());
    await waitFor(() => expect(result.current.initialized).toBe(true));

    await act(async () => {
      await result.current.unlock('correct-password');
    });

    expect(invoke).toHaveBeenCalledWith('unlock_vault_cmd', { password: 'correct-password' });
    expect(result.current.unlocked).toBe(true);
  });

  it('sets error on unlock failure', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'check_vault_initialized') return Promise.resolve(true);
      if (cmd === 'check_vault_unlocked') return Promise.resolve(false);
      if (cmd === 'unlock_vault_cmd') return Promise.reject(new Error('bad password'));
      return Promise.resolve();
    });

    const { result } = renderHook(() => useVault());
    await waitFor(() => expect(result.current.initialized).toBe(true));

    await act(async () => {
      await result.current.unlock('wrong-password');
    });

    expect(result.current.error).toBe('Incorrect password');
    expect(result.current.unlocked).toBe(false);
  });

  it('calls invoke on lock and sets unlocked false', async () => {
    const { result } = renderHook(() => useVault());
    await waitFor(() => expect(result.current.initialized).toBe(true));

    // First unlock
    await act(async () => {
      await result.current.unlock('password');
    });
    expect(result.current.unlocked).toBe(true);

    // Then lock
    await act(async () => {
      await result.current.lock();
    });

    expect(invoke).toHaveBeenCalledWith('lock_vault');
    expect(result.current.unlocked).toBe(false);
  });
});
