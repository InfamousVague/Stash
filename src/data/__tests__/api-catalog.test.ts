import catalog from '../api-catalog.json';
import type { ApiService } from '../../types';

const services = catalog as ApiService[];

describe('api-catalog', () => {
  it('has 150+ entries', () => {
    expect(services.length).toBeGreaterThanOrEqual(150);
  });

  it('all entries have required fields', () => {
    services.forEach((service) => {
      expect(service.id).toBeTruthy();
      expect(typeof service.id).toBe('string');
      expect(service.name).toBeTruthy();
      expect(typeof service.name).toBe('string');
      expect(service.category).toBeTruthy();
      expect(typeof service.category).toBe('string');
      expect(Array.isArray(service.envKeys)).toBe(true);
      expect(service.envKeys.length).toBeGreaterThan(0);
      expect(service.portalUrl).toBeTruthy();
      expect(typeof service.portalUrl).toBe('string');
    });
  });

  it('has no duplicate IDs', () => {
    const ids = services.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all portalUrls start with https://', () => {
    services.forEach((service) => {
      expect(service.portalUrl).toMatch(/^https:\/\//);
    });
  });
});
