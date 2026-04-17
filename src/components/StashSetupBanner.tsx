import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { alertTriangle } from '@base/primitives/icon/icons/alert-triangle';
import { check } from '@base/primitives/icon/icons/check';
import { x } from '@base/primitives/icon/icons/x';
import { ShareWizard } from './ShareWizard';
import { Tip } from './Tip';
import './StashSetupBanner.css';

interface StashSetupBannerProps {
  projectId: string;
  projectName: string;
  onSetupComplete?: () => void;
}

export function StashSetupBanner({ projectId, projectName, onSetupComplete }: StashSetupBannerProps) {
  const { t } = useTranslation();
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    invoke<boolean>('check_lock_initialized', { projectId })
      .then(setInitialized)
      .catch(() => setInitialized(false));
  }, [projectId]);

  if (initialized === null || initialized || dismissed) return null;

  return (
    <>
      <div className="stash-setup-banner">
        <div className="stash-setup-banner__icon">
          <Icon icon={alertTriangle} size="base" color="currentColor" />
        </div>
        <div className="stash-setup-banner__content">
          <p className="stash-setup-banner__title">{t('stashSetup.title')}</p>
          <p className="stash-setup-banner__desc">{t('stashSetup.desc')}</p>
        </div>
        <div className="stash-setup-banner__actions">
          <Button variant="primary" size="sm" icon={check} onClick={() => setWizardOpen(true)}>
            {t('stashSetup.enable')}
          </Button>
          <Tip content={t('common.dismiss')}><Button variant="ghost" size="sm" iconOnly icon={x} onClick={() => setDismissed(true)} aria-label={t('common.dismiss')} /></Tip>
        </div>
      </div>
      <ShareWizard
        open={wizardOpen}
        projectId={projectId}
        projectName={projectName}
        onClose={() => setWizardOpen(false)}
        onComplete={() => {
          setInitialized(true);
          onSetupComplete?.();
        }}
      />
    </>
  );
}
