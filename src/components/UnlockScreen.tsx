import { useState } from 'react';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import stashIcon from '../assets/stash-icon.png';
import './UnlockScreen.css';

interface UnlockScreenProps {
  initialized: boolean;
  error: string;
  onInit: (password: string) => void;
  onUnlock: (password: string) => void;
}

export function UnlockScreen({ initialized, error, onInit, onUnlock }: UnlockScreenProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!initialized) {
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirm) {
        setLocalError('Passwords do not match');
        return;
      }
      onInit(password);
    } else {
      onUnlock(password);
    }
  };

  const displayError = localError || error;

  return (
    <div className="unlock-screen">
      <form className="unlock-screen__card" onSubmit={handleSubmit}>
        <img src={stashIcon} alt="Stash" className="unlock-screen__icon" />
        <h1 className="unlock-screen__title">
          {initialized ? 'Unlock Stash' : 'Create Vault'}
        </h1>
        <p className="unlock-screen__desc">
          {initialized
            ? 'Enter your master password to unlock.'
            : 'Set a master password to encrypt your vault.'}
        </p>

        <div className="unlock-screen__fields">
          <Input
            size="md"
            variant="outline"
            type="password"
            placeholder="Master password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {!initialized && (
            <Input
              size="md"
              variant="outline"
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </div>

        {displayError && (
          <p className="unlock-screen__error">{displayError}</p>
        )}

        <Button variant="primary" size="md" type="submit">
          {initialized ? 'Unlock' : 'Create Vault'}
        </Button>
      </form>
    </div>
  );
}
