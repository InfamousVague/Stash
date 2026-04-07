import { getSuggestions } from '../framework-suggestions';

describe('getSuggestions', () => {
  it('returns suggestions for known framework', () => {
    const suggestions = getSuggestions('next', []);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions).toContain('NEXT_PUBLIC_API_URL');
    expect(suggestions).toContain('NEXTAUTH_SECRET');
  });

  it('returns empty for unknown framework', () => {
    const suggestions = getSuggestions('unknown-framework', []);
    expect(suggestions).toEqual([]);
  });

  it('returns empty for null framework', () => {
    const suggestions = getSuggestions(null, []);
    expect(suggestions).toEqual([]);
  });

  it('filters out existing keys', () => {
    const existing = ['NEXT_PUBLIC_API_URL', 'NEXTAUTH_SECRET'];
    const suggestions = getSuggestions('next', existing);
    expect(suggestions).not.toContain('NEXT_PUBLIC_API_URL');
    expect(suggestions).not.toContain('NEXTAUTH_SECRET');
    expect(suggestions.length).toBeGreaterThan(0);
  });
});
