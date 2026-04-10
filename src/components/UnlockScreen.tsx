import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { fingerprint } from '@base/primitives/icon/icons/fingerprint';
import { lockOpen } from '@base/primitives/icon/icons/lock-open';
import stashIcon from '../assets/stash-icon.png';
import './UnlockScreen.css';

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  // Penalize repeated chars
  if (/(.)\1{2,}/.test(pw)) score = Math.max(score - 1, 0);

  if (score <= 1) return { score: 1, label: 'Weak', color: 'var(--color-error, #ef4444)' };
  if (score <= 2) return { score: 2, label: 'Fair', color: 'var(--color-warning, #f59e0b)' };
  if (score <= 4) return { score: 3, label: 'Good', color: 'var(--color-info, #3b82f6)' };
  return { score: 4, label: 'Strong', color: 'var(--color-success, #22c55e)' };
}

interface UnlockScreenProps {
  initialized: boolean;
  error: string;
  hasKeychain?: boolean;
  onInit: (password: string) => void;
  onUnlock: (password: string) => Promise<boolean> | void;
  onUnlockKeychain?: () => void;
  onEnableKeychain?: () => void;
}

export function UnlockScreen({ initialized, error, hasKeychain, onInit, onUnlock, onUnlockKeychain, onEnableKeychain }: UnlockScreenProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');
  const [enableTouchId, setEnableTouchId] = useState(false);
  const [setupPrompt, setSetupPrompt] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!initialized) {
      if (password.length < 6) {
        setLocalError(t('unlock.passwordMinLength'));
        return;
      }
      if (password !== confirm) {
        setLocalError(t('unlock.passwordsNoMatch'));
        return;
      }
      onInit(password);
    } else {
      // If user wants Touch ID, signal it before unlocking so App.tsx can handle it after
      if (enableTouchId && onEnableKeychain) {
        localStorage.setItem('stash-pending-touchid-setup', 'true');
      }
      onUnlock(password);
    }
  };

  const displayError = localError || error;

  return (
    <div className="unlock-screen">
      <form className="unlock-screen__card" onSubmit={handleSubmit}>
        <img src={stashIcon} alt="Stash" className="unlock-screen__icon" />
        <h1 className="unlock-screen__title">
          {initialized ? t('unlock.title') : t('unlock.createVault')}
        </h1>
        <p className="unlock-screen__desc">
          {initialized ? t('unlock.enterPassword') : t('unlock.setPassword')}
        </p>

        <div className="unlock-screen__fields">
          <Input
            size="md"
            variant="outline"
            type="password"
            placeholder={t('unlock.masterPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus={!hasKeychain}
          />
          {!initialized && password && (() => {
            const strength = getPasswordStrength(password);
            return (
              <div className="unlock-screen__strength">
                <div className="unlock-screen__strength-track">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className="unlock-screen__strength-segment"
                      style={{
                        background: level <= strength.score ? strength.color : 'var(--color-border-default)',
                      }}
                    />
                  ))}
                </div>
                <span className="unlock-screen__strength-label" style={{ color: strength.color }}>
                  {strength.label}
                </span>
              </div>
            );
          })()}
          {!initialized && (
            <Input
              size="md"
              variant="outline"
              type="password"
              placeholder={t('unlock.confirmPassword')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </div>

        {setupPrompt && !hasKeychain && (
          <p className="unlock-screen__setup-hint">
            {t('unlock.touchIdSetupHint')}
          </p>
        )}

        {displayError && (
          <p className="unlock-screen__error">{displayError}</p>
        )}

        <div className="unlock-screen__actions">
          <Button variant="primary" size="md" type="submit" icon={initialized ? lockOpen : undefined}>
            {initialized ? t('unlock.unlock') : t('unlock.createVault')}
          </Button>
          {initialized && (
            <Button
              variant="secondary"
              size="md"
              icon={fingerprint}
              type="button"
              onClick={() => {
                if (hasKeychain && onUnlockKeychain) {
                  onUnlockKeychain();
                } else {
                  setEnableTouchId(true);
                  setSetupPrompt(true);
                  setLocalError('');
                }
              }}
            >
              {t('unlock.touchId')}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
