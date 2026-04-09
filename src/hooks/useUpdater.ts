import { useState, useCallback, useEffect } from 'react';
import { check } from '@tauri-apps/plugin-updater';

interface UpdateInfo {
  version: string;
  body: string;
  date: string | null;
}

export function useUpdater() {
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (!(window as any).__TAURI_INTERNALS__) {
      setError('Updates are only available in the desktop app');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable({
          version: update.version,
          body: update.body || '',
          date: update.date || null,
        });
        // Store the update object for later download
        (window as any).__stashPendingUpdate = update;
      } else {
        setUpdateAvailable(null);
      }
    } catch (e) {
      console.error('Update check failed:', e);
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    const update = (window as any).__stashPendingUpdate;
    if (!update) return;
    setDownloading(true);
    setProgress(0);
    try {
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            setProgress(100);
            break;
        }
      });
      // After install, the app will restart automatically
    } catch (e) {
      setError(String(e));
      setDownloading(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  // Check on mount, but silently (don't show errors)
  // Skip the auto-check if we're outside Tauri (e.g. browser/E2E)
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    check().then((update) => {
      if (update) {
        setUpdateAvailable({
          version: update.version,
          body: update.body || '',
          date: update.date || null,
        });
        (window as any).__stashPendingUpdate = update;
      }
    }).catch(() => {
      // Silently swallow — endpoint may not be configured yet
    });
  }, []);

  return {
    checking,
    updateAvailable,
    downloading,
    progress,
    error,
    dismissed,
    checkForUpdate,
    downloadAndInstall,
    dismiss,
  };
}
