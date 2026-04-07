import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useProfiles() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>('default');

  const loadProfiles = useCallback(async (projectId: string) => {
    try {
      const result = await invoke<string[]>('list_profiles', { projectId });
      setProfiles(result);
      const active = await invoke<string>('get_active_profile', { projectId });
      setActiveProfile(active);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  }, []);

  const switchProfile = useCallback(async (projectId: string, profileName: string) => {
    try {
      await invoke('switch_profile', { projectId, profileName });
      setActiveProfile(profileName);
    } catch (err) {
      console.error('Failed to switch profile:', err);
    }
  }, []);

  const createProfile = useCallback(async (projectId: string, name: string, copyFrom?: string) => {
    try {
      await invoke('create_profile', { projectId, name, copyFrom });
      await loadProfiles(projectId);
    } catch (err) {
      console.error('Failed to create profile:', err);
    }
  }, [loadProfiles]);

  return { profiles, activeProfile, loadProfiles, switchProfile, createProfile };
}
