import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useVault() {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    invoke<boolean>('check_vault_initialized').then(setInitialized).catch(() => setInitialized(false));
    invoke<boolean>('check_vault_unlocked').then(setUnlocked).catch(() => {});
  }, []);

  const initVault = useCallback(async (password: string) => {
    try {
      setError('');
      await invoke('init_vault_cmd', { password });
      setInitialized(true);
      setUnlocked(true);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const unlock = useCallback(async (password: string) => {
    try {
      setError('');
      await invoke('unlock_vault_cmd', { password });
      setUnlocked(true);
    } catch {
      setError('Incorrect password');
    }
  }, []);

  const lock = useCallback(async () => {
    await invoke('lock_vault');
    setUnlocked(false);
  }, []);

  return { initialized, unlocked, error, initVault, unlock, lock };
}
