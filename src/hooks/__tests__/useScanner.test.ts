import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useScanner } from '../useScanner';
import { mockScanResults } from '../../test/mocks';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const listeners: Record<string, (event: any) => void> = {};

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'get_scan_results') return Promise.resolve([]);
    if (cmd === 'start_scan') return Promise.resolve();
    return Promise.resolve();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vi.mocked(listen) as any).mockImplementation((event: string, callback: any) => {
    listeners[event] = callback;
    return Promise.resolve(() => {});
  });
});

describe('useScanner', () => {
  it('has correct initial state', () => {
    const { result } = renderHook(() => useScanner());
    expect(result.current.scanning).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(result.current.progress).toBeNull();
  });

  it('calls invoke on startScan', async () => {
    const { result } = renderHook(() => useScanner());

    await act(async () => {
      await result.current.startScan();
    });

    expect(invoke).toHaveBeenCalledWith('start_scan');
    expect(result.current.scanning).toBe(true);
  });

  it('populates results after scan-complete event', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_scan_results') return Promise.resolve(mockScanResults);
      if (cmd === 'start_scan') return Promise.resolve();
      return Promise.resolve();
    });

    const { result } = renderHook(() => useScanner());

    await waitFor(() => {
      expect(listeners['scan-complete']).toBeDefined();
    });

    await act(async () => {
      await result.current.startScan();
    });

    await act(async () => {
      await listeners['scan-complete']({ payload: undefined });
    });

    await waitFor(() => {
      expect(result.current.scanning).toBe(false);
      expect(result.current.results).toEqual(mockScanResults);
    });
  });
});
