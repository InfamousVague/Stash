import { renderHook, act } from '@testing-library/react';
import { useToast } from '../useToast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useToast', () => {
  it('addToast adds a toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Test message');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].variant).toBe('success');
    expect(result.current.toasts[0].message).toBe('Test message');
  });

  it('toast auto-dismisses after timeout', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.info('Auto-dismiss me');
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('dismissToast removes specific toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('First');
      result.current.error('Second');
    });
    expect(result.current.toasts).toHaveLength(2);

    const firstId = result.current.toasts[0].id;
    act(() => {
      result.current.dismissToast(firstId);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Second');
  });
});
