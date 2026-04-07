import { useState, useMemo, useCallback } from 'react';
import catalog from '../data/api-catalog.json';
import type { ApiService } from '../types';

const services: ApiService[] = catalog as ApiService[];

const PREFIX_MAP: Record<string, string> = {
  STRIPE_: 'stripe',
  AWS_: 'aws',
  OPENAI_: 'openai',
  ANTHROPIC_: 'anthropic',
  FIREBASE_: 'firebase',
  SUPABASE_: 'supabase',
  VERCEL_: 'vercel',
  GITHUB_: 'github',
  SENDGRID_: 'sendgrid',
  TWILIO_: 'twilio',
  RESEND_: 'resend',
  CLOUDFLARE_: 'cloudflare',
  SENTRY_: 'sentry',
  POSTHOG_: 'posthog',
  REDIS_: 'redis',
  UPSTASH_: 'redis',
  AUTH0_: 'auth0',
  ALGOLIA_: 'algolia',
  REPLICATE_: 'replicate',
  GOOGLE_MAPS_: 'google-maps',
};

export function useDirectory() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set(services.map((s) => s.category));
    return Array.from(cats).sort();
  }, []);

  const filtered = useMemo(() => {
    let result = services;

    if (category) {
      result = result.filter((s) => s.category === category);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [query, category]);

  const searchServices = useCallback((q: string) => {
    setQuery(q);
  }, []);

  const matchEnvKey = useCallback((key: string): ApiService | null => {
    // Direct match on envKeys
    const directMatch = services.find((s) =>
      s.envKeys.some((ek) => ek === key)
    );
    if (directMatch) return directMatch;

    // Prefix match
    const upper = key.toUpperCase();
    for (const [prefix, serviceId] of Object.entries(PREFIX_MAP)) {
      if (upper.startsWith(prefix)) {
        const svc = services.find((s) => s.id === serviceId);
        if (svc) return svc;
      }
    }

    return null;
  }, []);

  return {
    query,
    category,
    categories,
    filtered,
    searchServices,
    setCategory,
    matchEnvKey,
  };
}
