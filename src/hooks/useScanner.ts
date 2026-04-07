import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ScanProgress, EnvFileGroup } from '../types';

export function useScanner() {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<EnvFileGroup[]>([]);
  const unlistenRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const setup = async () => {
      const unlistenProgress = await listen<ScanProgress>('scan-progress', (event) => {
        setProgress(event.payload);
      });

      const unlistenComplete = await listen('scan-complete', async () => {
        try {
          const scanResults = await invoke<EnvFileGroup[]>('get_scan_results');
          setResults(scanResults || []);
        } catch {
          setResults([]);
        }
        setScanning(false);
        setProgress((prev) =>
          prev ? { ...prev, complete: true } : null
        );
      });

      unlistenRef.current = [unlistenProgress, unlistenComplete];
    };

    setup();

    return () => {
      unlistenRef.current.forEach((fn) => fn());
    };
  }, []);

  // Load any existing scan results on mount
  useEffect(() => {
    invoke<EnvFileGroup[]>('get_scan_results')
      .then((r) => { if (r && r.length > 0) setResults(r); })
      .catch(() => {});
  }, []);

  const startScan = useCallback(async () => {
    try {
      setScanning(true);
      setResults([]);
      setProgress({ directories_scanned: 0, files_found: 0, current_dir: '', complete: false });
      await invoke('start_scan');
    } catch (err) {
      console.error('Scan failed:', err);
      setScanning(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setProgress(null);
  }, []);

  return { scanning, progress, results, startScan, dismiss };
}
