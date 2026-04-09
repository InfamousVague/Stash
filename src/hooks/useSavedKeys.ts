import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface SavedKey {
  id: string;
  service_id: string;
  service_name: string;
  env_key: string;
  value: string;
  notes: string;
  created_at: number;
}

export function useSavedKeys() {
  const [keys, setKeys] = useState<SavedKey[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<SavedKey[]>('list_saved_keys');
      setKeys(list);
    } catch (err) {
      console.error('Failed to load saved keys:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const addKey = useCallback(async (serviceId: string, serviceName: string, envKey: string, value: string, notes: string) => {
    return invoke<SavedKey>('add_saved_key', { serviceId, serviceName, envKey, value, notes });
  }, []);

  const updateKey = useCallback(async (id: string, value: string, notes: string) => {
    await invoke('update_saved_key', { id, value, notes });
  }, []);

  const deleteKey = useCallback(async (id: string) => {
    await invoke('delete_saved_key', { id });
  }, []);

  return { keys, loading, refresh, addKey, updateKey, deleteKey };
}
