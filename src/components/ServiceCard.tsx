import { Card } from '@base/primitives/card';
import '@base/primitives/card/card.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { externalLink } from '@base/primitives/icon/icons/external-link';
import type { ApiService } from '../types';
import './ServiceCard.css';

interface ServiceCardProps {
  service: ApiService;
}

const CATEGORY_COLORS: Record<string, 'accent' | 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  AI: 'accent',
  Payments: 'success',
  Cloud: 'info',
  Backend: 'warning',
  Hosting: 'neutral',
  'Developer Tools': 'neutral',
  Email: 'accent',
  Communication: 'info',
  Monitoring: 'error',
  Analytics: 'warning',
  Database: 'success',
  Maps: 'info',
  Search: 'neutral',
  Auth: 'warning',
};

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <Card variant="outlined" padding="md" className="service-card">
      <div className="service-card__header">
        <span className="service-card__name">{service.name}</span>
        <Badge variant="subtle" size="sm" color={CATEGORY_COLORS[service.category] ?? 'neutral'}>
          {service.category}
        </Badge>
      </div>
      <p className="service-card__desc">{service.description}</p>
      <div className="service-card__keys">
        {service.envKeys.map((k) => (
          <code key={k} className="service-card__key">{k}</code>
        ))}
      </div>
      <div className="service-card__footer">
        <Button
          variant="secondary"
          size="sm"
          icon={externalLink}
          onClick={() => window.open(service.portalUrl, '_blank')}
        >
          Get Key
        </Button>
      </div>
    </Card>
  );
}
