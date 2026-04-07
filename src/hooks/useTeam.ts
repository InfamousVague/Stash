import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface TeamMember {
  name: string;
  public_key: string;
}

export function useTeam() {
  const [publicKey, setPublicKey] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);

  const loadKey = useCallback(async () => {
    try {
      const key = await invoke<string>('get_public_key');
      setPublicKey(key);
    } catch {
      // No key yet — will generate on first use
    }
  }, []);

  const generateKey = useCallback(async () => {
    const key = await invoke<string>('generate_team_key');
    setPublicKey(key);
    return key;
  }, []);

  const loadMembers = useCallback(async (projectId: string) => {
    try {
      const result = await invoke<TeamMember[]>('list_team_members', { projectId });
      setMembers(result);
    } catch {
      setMembers([]);
    }
  }, []);

  const addMember = useCallback(async (projectId: string, name: string, key: string) => {
    await invoke('add_team_member', { projectId, name, publicKey: key });
    await loadMembers(projectId);
  }, [loadMembers]);

  const removeMember = useCallback(async (projectId: string, name: string) => {
    await invoke('remove_team_member', { projectId, name });
    await loadMembers(projectId);
  }, [loadMembers]);

  const pushLock = useCallback(async (projectId: string) => {
    await invoke('push_lock', { projectId });
  }, []);

  const pullLock = useCallback(async (projectId: string) => {
    await invoke('pull_lock', { projectId });
  }, []);

  return {
    publicKey, members,
    loadKey, generateKey, loadMembers,
    addMember, removeMember, pushLock, pullLock,
  };
}
