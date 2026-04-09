import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useVault() {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [hasKeychain, setHasKeychain] = useState(false);

  const refreshKeychain = useCallback(() => {
    invoke<boolean>('has_keychain_key').then(setHasKeychain).catch(() => {});
  }, []);

  useEffect(() => {
    invoke<boolean>('check_vault_initialized').then(setInitialized).catch(() => setInitialized(false));
    invoke<boolean>('check_vault_unlocked').then(setUnlocked).catch(() => {});
    refreshKeychain();

    // Listen for lock events from other useVault instances
    const handleLocked = () => {
      setUnlocked(false);
      refreshKeychain();
    };
    window.addEventListener('stash-vault-locked', handleLocked);
    return () => window.removeEventListener('stash-vault-locked', handleLocked);
  }, [refreshKeychain]);

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
      return true;
    } catch {
      setError('Incorrect password');
      return false;
    }
  }, []);

  const lock = useCallback(async () => {
    await invoke('lock_vault');
    setUnlocked(false);
    // Re-check keychain so unlock screen shows biometric option
    invoke<boolean>('has_keychain_key').then(setHasKeychain).catch(() => {});
    // Notify other useVault instances (e.g. App.tsx) that vault was locked
    window.dispatchEvent(new Event('stash-vault-locked'));
  }, []);

  const unlockFromKeychain = useCallback(async () => {
    try {
      setError('');
      await invoke('unlock_vault_from_keychain');
      setUnlocked(true);
    } catch {
      setError('Touch ID unlock failed. Please use your password instead.');
      setHasKeychain(false);
    }
  }, []);

  const storeInKeychain = useCallback(async () => {
    await invoke('store_key_in_keychain');
    setHasKeychain(true);
  }, []);

  const clearKeychain = useCallback(async () => {
    await invoke('clear_keychain_key');
    setHasKeychain(false);
  }, []);

  return {
    initialized, unlocked, error, hasKeychain,
    initVault, unlock, lock,
    unlockFromKeychain, storeInKeychain, clearKeychain,
  };
}
