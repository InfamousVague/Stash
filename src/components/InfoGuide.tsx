import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import './InfoGuide.css';

interface InfoGuideProps {
  storageKey: string;
  titleKey: string;
  stepKeys: string[];
}

export function InfoGuide({ storageKey, titleKey, stepKeys }: InfoGuideProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => {
    return localStorage.getItem(storageKey) !== 'true';
  });

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(storageKey, 'true');
  };

  return (
    <div className="info-guide">
      <div className="info-guide__header">
        <h3 className="info-guide__title">{t(titleKey)}</h3>
        <Button variant="ghost" size="sm" onClick={dismiss}>{t('common.dismiss')}</Button>
      </div>
      <ol className="info-guide__steps">
        {stepKeys.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
    </div>
  );
}
