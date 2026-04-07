import { renderHook, act } from '@testing-library/react';
import { useDirectory } from '../useDirectory';

describe('useDirectory', () => {
  it('searchServices filters by name', () => {
    const { result } = renderHook(() => useDirectory());

    act(() => {
      result.current.searchServices('stripe');
    });

    expect(result.current.filtered.length).toBeGreaterThan(0);
    expect(result.current.filtered.every((s) =>
      s.name.toLowerCase().includes('stripe') ||
      s.category.toLowerCase().includes('stripe') ||
      s.description.toLowerCase().includes('stripe')
    )).toBe(true);
  });

  it('searchServices filters by category', () => {
    const { result } = renderHook(() => useDirectory());

    act(() => {
      result.current.searchServices('AI');
    });

    expect(result.current.filtered.length).toBeGreaterThan(0);
  });

  it('matchEnvKey matches OPENAI_API_KEY to OpenAI', () => {
    const { result } = renderHook(() => useDirectory());

    const service = result.current.matchEnvKey('OPENAI_API_KEY');
    expect(service).toBeTruthy();
    expect(service!.id).toBe('openai');
  });

  it('matchEnvKey matches AWS_ACCESS_KEY_ID to AWS', () => {
    const { result } = renderHook(() => useDirectory());

    const service = result.current.matchEnvKey('AWS_ACCESS_KEY_ID');
    expect(service).toBeTruthy();
    expect(service!.id).toBe('aws');
  });

  it('matchEnvKey returns null for unknown key', () => {
    const { result } = renderHook(() => useDirectory());

    const service = result.current.matchEnvKey('TOTALLY_UNKNOWN_THING');
    expect(service).toBeNull();
  });
});
