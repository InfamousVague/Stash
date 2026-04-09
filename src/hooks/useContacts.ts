import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Contact } from '../types';

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<Contact[]>('list_contacts');
      setContacts(list);
    } catch (err) {
      console.error('Failed to load contacts:', err);
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

  const getShareLink = useCallback(async (name: string, publicKey: string): Promise<string> => {
    return invoke<string>('generate_share_link', { name, publicKey });
  }, []);

  return { contacts, loading, refresh, addContact, removeContact, getShareLink };
}
