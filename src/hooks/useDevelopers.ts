import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DeveloperInfo } from '../types';

export function useDevelopers() {
  const [developers, setDevelopers] = useState<DeveloperInfo[]>([]);
  const [myPublicKey, setMyPublicKey] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [devs, key] = await Promise.all([
        invoke<DeveloperInfo[]>('list_all_team_members'),
        invoke<string>('get_public_key').catch(() => ''),
      ]);
      setDevelopers(devs);
      setMyPublicKey(key);
    } catch (err) {
      console.error('Failed to load developers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { developers, myPublicKey, loading, refresh };
}
