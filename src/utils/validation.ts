export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getStaleStatus(lastChanged?: number): 'fresh' | 'aging' | 'stale' | 'unknown' {
  if (!lastChanged) return 'unknown';
  const now = Date.now() / 1000;
  const days = (now - lastChanged) / 86400;
  if (days > 90) return 'stale';
  if (days > 30) return 'aging';
  return 'fresh';
}

export function validateEnvVar(key: string, value: string): string | null {
  if (!value) return null;
  const upper = key.toUpperCase();

  if (value !== value.trimEnd()) return 'Value has trailing whitespace';

  if (upper.includes('AWS_ACCESS_KEY')) {
    if (!value.startsWith('AKIA') || value.length !== 20)
      return 'AWS access keys should start with AKIA and be 20 characters';
  }
  if (upper.startsWith('STRIPE_') && (upper.includes('KEY') || upper.includes('SECRET'))) {
    const prefixes = ['sk_live_', 'sk_test_', 'pk_live_', 'pk_test_', 'rk_live_', 'rk_test_'];
    if (!prefixes.some(p => value.startsWith(p)))
      return 'Stripe keys should start with sk_live_, sk_test_, pk_live_, or pk_test_';
  }
  if (upper.includes('GITHUB_TOKEN') || upper.includes('GH_TOKEN')) {
    const prefixes = ['ghp_', 'gho_', 'ghs_', 'github_pat_'];
    if (!prefixes.some(p => value.startsWith(p)))
      return 'GitHub tokens should start with ghp_, gho_, ghs_, or github_pat_';
  }
  if (upper.endsWith('_URL') || upper.endsWith('_URI')) {
    if (!value.includes('://'))
      return 'URL values should include a protocol (e.g. https://, postgres://)';
  }
  if (upper.endsWith('_PORT')) {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535)
      return 'Port should be a number between 1 and 65535';
  }
  return null;
}

export function detectServiceFromValue(val: string): string | null {
  if (val.startsWith('AKIA') && val.length >= 16) return 'AWS';
  if (val.startsWith('sk_live_') || val.startsWith('sk_test_')) return 'Stripe';
  if (val.startsWith('pk_live_') || val.startsWith('pk_test_')) return 'Stripe';
  if (val.startsWith('ghp_') || val.startsWith('gho_') || val.startsWith('ghs_') || val.startsWith('github_pat_')) return 'GitHub';
  if (val.startsWith('xoxb-') || val.startsWith('xoxp-') || val.startsWith('xoxs-')) return 'Slack';
  if (val.startsWith('SG.') && val.length > 20) return 'SendGrid';
  if (val.startsWith('AIza') && val.length > 20) return 'Google Cloud';
  if (val.startsWith('sq0atp-') || val.startsWith('sq0csp-')) return 'Square';
  if (val.startsWith('sk-') && val.length > 20) return 'OpenAI';
  return null;
}
