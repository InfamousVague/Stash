import { useEffect } from 'react';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';

interface DeepLinkCallbacks {
  onAddContact: (name: string, key: string) => void;
  onImportVar: (from: string, varKey: string, enc: string) => void;
  onImportKey: (service: string, envKey: string) => void;
  onAuthComplete: (token: string) => void;
}

export function useDeepLinks({ onAddContact, onImportVar, onImportKey, onAuthComplete }: DeepLinkCallbacks) {
  useEffect(() => {
    // onOpenUrl throws outside Tauri (e.g. in browser / E2E tests)
    if (!(window as any).__TAURI_INTERNALS__) return;
    const unlisten = onOpenUrl((urls) => {
      for (const url of urls) {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'stash:' && parsed.hostname === 'add-contact') {
            const name = parsed.searchParams.get('name') || '';
            const key = parsed.searchParams.get('key') || '';
            if (name && key) {
              onAddContact(name, key);
            }
          }
          if (parsed.protocol === 'stash:' && parsed.hostname === 'import-var') {
            const varKey = parsed.searchParams.get('key') || '';
            const enc = parsed.searchParams.get('enc') || '';
            const from = parsed.searchParams.get('from') || '';
            if (varKey && enc) {
              onImportVar(from, varKey, enc);
            }
          }
          if (parsed.protocol === 'stash:' && parsed.hostname === 'import-key') {
            const service = parsed.searchParams.get('service') || '';
            const envKey = parsed.searchParams.get('envKey') || '';
            onImportKey(service, envKey);
          }
          if (parsed.protocol === 'stash:' && parsed.hostname === 'auth-complete') {
            const token = parsed.searchParams.get('token') || '';
            if (token) {
              onAuthComplete(token);
            }
          }
        } catch (e) {
          console.error('Failed to parse deep link:', e);
        }
      }
    });
    return () => { unlisten.then(fn => fn()).catch(() => {}); };
  }, [onAddContact, onImportVar, onImportKey, onAuthComplete]);
}
