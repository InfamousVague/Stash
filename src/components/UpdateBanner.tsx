import { useTranslation } from 'react-i18next';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { download } from '@base/primitives/icon/icons/download';
import { rotateCw } from '@base/primitives/icon/icons/rotate-cw';
import { circleCheck } from '@base/primitives/icon/icons/circle-check';
import { x } from '@base/primitives/icon/icons/x';
import { Progress } from '@base/primitives/progress';
import '@base/primitives/progress/progress.css';
import './UpdateBanner.css';

interface UpdateBannerProps {
  version: string;
  downloading: boolean;
  progress: number;
  readyToRelaunch: boolean;
  onUpdate: () => void;
  onRelaunch: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  version,
  downloading,
  progress,
  readyToRelaunch,
  onUpdate,
  onRelaunch,
  onDismiss,
}: UpdateBannerProps) {
  const { t } = useTranslation();

  // State: ready to relaunch
  if (readyToRelaunch) {
    return (
      <div className="update-banner update-banner--ready">
        <div className="update-banner__icon">
          <Icon icon={circleCheck} size="base" color="currentColor" />
        </div>
        <div className="update-banner__text">
          <span className="update-banner__title">
            {t('update.installed', { version })}
          </span>
        </div>
        <div className="update-banner__actions">
          <Button variant="primary" size="sm" icon={rotateCw} onClick={onRelaunch}>
            {t('update.relaunch')}
          </Button>
        </div>
      </div>
    );
  }

  // State: downloading
  if (downloading) {
    return (
      <div className="update-banner update-banner--downloading">
        <div className="update-banner__icon">
          <Icon icon={download} size="base" color="currentColor" />
        </div>
        <div className="update-banner__text">
          <span className="update-banner__title">
            {t('update.downloading', { version })}
          </span>
          <Progress value={progress} size="sm" />
        </div>
        <div className="update-banner__actions">
          <span className="update-banner__progress-text">{progress}%</span>
        </div>
      </div>
    );
  }

  // State: update available
  return (
    <div className="update-banner">
      <div className="update-banner__icon">
        <Icon icon={download} size="base" color="currentColor" />
      </div>
      <div className="update-banner__text">
        <span className="update-banner__title">
          {t('update.available', { version })}
        </span>
      </div>
      <div className="update-banner__actions">
        <Button variant="primary" size="sm" onClick={onUpdate}>
          {t('update.updateNow')}
        </Button>
        <button className="update-banner__dismiss" onClick={onDismiss}>
          <Icon icon={x} size="sm" color="currentColor" />
        </button>
      </div>
    </div>
  );
}
