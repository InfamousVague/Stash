import { useTranslation } from 'react-i18next';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { key } from '@base/primitives/icon/icons/key';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { ApiService } from '../types';
import './ServiceCard.css';

interface ServiceCardProps {
  service: ApiService;
  style?: React.CSSProperties;
}

export function ServiceCard({ service, style }: ServiceCardProps) {
  const { t } = useTranslation();
  return (
    <div className="service-card" style={style}>
      <div className="service-card__header">
        <span className="service-card__name">{service.name}</span>
        <Badge variant="subtle" size="sm" color="neutral">
          {service.category}
        </Badge>
      </div>
      <p className="service-card__desc">{service.description}</p>
      <div className="service-card__keys">
        {service.envKeys.slice(0, 6).map((k) => (
          <code key={k} className="service-card__key">{k}</code>
        ))}
        {service.envKeys.length > 6 && (
          <code className="service-card__key">{t('directory.more', { count: service.envKeys.length - 6 })}</code>
        )}
      </div>
      <div className="service-card__footer">
        <Button
          variant="secondary"
          size="md"
          icon={key}
          onClick={() => openUrl(service.portalUrl)}
        >
          {t('directory.getKey')}
        </Button>
      </div>
    </div>
  );
}
