import { useTranslation } from 'react-i18next';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { download } from '@base/primitives/icon/icons/download';
import { x } from '@base/primitives/icon/icons/x';
import { Progress } from '@base/primitives/progress';
import '@base/primitives/progress/progress.css';
import './UpdateBanner.css';

interface UpdateBannerProps {
  version: string;
  downloading: boolean;
  progress: number;
  onUpdate: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ version, downloading, progress, onUpdate, onDismiss }: UpdateBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="update-banner">
      <div className="update-banner__icon">
        <Icon icon={download} size="base" color="currentColor" />
      </div>
      <div className="update-banner__text">
        <span className="update-banner__title">
          {t('update.available', { version })}
        </span>
        {downloading && (
          <Progress value={progress} size="sm" />
        )}
      </div>
      <div className="update-banner__actions">
        {!downloading ? (
          <>
            <Button variant="primary" size="sm" onClick={onUpdate}>
              {t('update.updateNow')}
            </Button>
            <button className="update-banner__dismiss" onClick={onDismiss}>
              <Icon icon={x} size="sm" color="currentColor" />
            </button>
          </>
        ) : (
          <span className="update-banner__progress-text">{progress}%</span>
        )}
      </div>
    </div>
  );
}
