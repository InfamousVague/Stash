import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Contact, DeveloperInfo } from '../types';

export interface Person {
  name: string;
  public_key: string;
  source: 'contact' | 'team' | 'both';
  projects: { id: string; name: string }[];
  added_at?: number;
  is_you: boolean;
}

export function usePeople() {
  const [people, setPeople] = useState<Person[]>([]);
  const [myPublicKey, setMyPublicKey] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [contacts, developers, pubKey] = await Promise.all([
        invoke<Contact[]>('list_contacts').catch(() => [] as Contact[]),
        invoke<DeveloperInfo[]>('list_all_team_members').catch(() => [] as DeveloperInfo[]),
        invoke<string>('get_public_key').catch(() => ''),
      ]);

      setMyPublicKey(pubKey);

      // Merge by public_key
      const map = new Map<string, Person>();

      for (const c of contacts) {
        map.set(c.public_key, {
          name: c.name,
          public_key: c.public_key,
          source: 'contact',
          projects: [],
          added_at: c.added_at,
          is_you: pubKey ? c.public_key === pubKey : false,
        });
      }

      for (const d of developers) {
        const existing = map.get(d.public_key);
        if (existing) {
          existing.source = 'both';
          existing.projects = d.projects;
          // Prefer developer name if contact name is generic
          if (d.name && d.name !== 'Me') {
            existing.name = d.name;
          }
        } else {
          map.set(d.public_key, {
            name: d.name,
            public_key: d.public_key,
            source: 'team',
            projects: d.projects,
            is_you: pubKey ? d.public_key === pubKey : false,
          });
        }
      }

      // Sort: you first, then alphabetical
      const merged = Array.from(map.values()).sort((a, b) => {
        if (a.is_you && !b.is_you) return -1;
        if (!a.is_you && b.is_you) return 1;
        return a.name.localeCompare(b.name);
      });

      setPeople(merged);
    } catch (err) {
      console.error('Failed to load people:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const addContact = useCallback(async (name: string, publicKey: string) => {
    await invoke('add_contact', { name, publicKey });
  }, []);

  const removeContact = useCallback(async (publicKey: string) => {
    await invoke('remove_contact', { publicKey });
  }, []);

  const addToProject = useCallback(async (name: string, publicKey: string, projectId: string) => {
    await invoke('add_team_member', { projectId, name, publicKey });
  }, []);

  const removeFromProject = useCallback(async (name: string, projectId: string) => {
    await invoke('remove_team_member', { projectId, name });
  }, []);

  const getShareLink = useCallback(async (name: string, publicKey: string): Promise<string> => {
    return invoke<string>('generate_share_link', { name, publicKey });
  }, []);

  return {
    people, myPublicKey, loading,
    refresh, addContact, removeContact,
    addToProject, removeFromProject, getShareLink,
  };
}
