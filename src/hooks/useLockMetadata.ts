import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

type MetadataMap = Record<string, unknown>;

/**
 * Hook for reading/writing shared metadata in the .stash.lock file.
 * Metadata is committed alongside encrypted variables and shared by all members.
 */
export function useLockMetadata(projectId: string | undefined) {
  const [metadata, setMetadata] = useState<MetadataMap>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await invoke<MetadataMap>('get_lock_metadata', { projectId });
      setMetadata(result);
    } catch {
      setMetadata({});
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const set = useCallback(async (key: string, value: unknown) => {
    if (!projectId) return;
    try {
      await invoke('set_lock_metadata', { projectId, key, value });
      setMetadata((prev) => ({ ...prev, [key]: value }));
    } catch (e) {
      throw e;
    }
  }, [projectId]);

  /** Convenience: get a typed value from metadata */
  const get = useCallback(<T = unknown>(key: string, fallback?: T): T => {
    return (metadata[key] as T) ?? (fallback as T);
  }, [metadata]);

  return { metadata, loading, load, set, get };
}
