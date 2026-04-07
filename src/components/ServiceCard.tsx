import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { ApiService } from '../types';
import './ServiceCard.css';

interface ServiceCardProps {
  service: ApiService;
}

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <div className="service-card">
      <div className="service-card__header">
        <span className="service-card__name">{service.name}</span>
        <Badge variant="subtle" size="sm" color="neutral">
          {service.category}
        </Badge>
      </div>
      <p className="service-card__desc">{service.description}</p>
      <div className="service-card__keys">
        {service.envKeys.slice(0, 3).map((k) => (
          <code key={k} className="service-card__key">{k}</code>
        ))}
        {service.envKeys.length > 3 && (
          <code className="service-card__key">+{service.envKeys.length - 3} more</code>
        )}
      </div>
      <div className="service-card__footer">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openUrl(service.portalUrl)}
        >
          Get Key →
        </Button>
      </div>
    </div>
  );
}
