import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Dialog } from '@base/primitives/dialog';
import '@base/primitives/dialog/dialog.css';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { userRound } from '@base/primitives/icon/icons/user-round';
import { check } from '@base/primitives/icon/icons/check';
import { useToastContext } from '../contexts/ToastContext';
import './IdentityPrompt.css';

/**
 * Checks if a git global user.name is configured.
 * If not, prompts the user to set one. Also renames any existing
 * "Me" members in lock files to the new name.
 */
export function IdentityPrompt() {
  const { t } = useTranslation();
  const toast = useToastContext();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Check on mount — only prompt once per session
    const dismissed = sessionStorage.getItem('stash-identity-prompted');
    if (dismissed) return;

    invoke<string>('get_git_username').then((gitName) => {
      if (!gitName) {
        // Pre-fill with $USER as a suggestion
        const fallback = '';
        setName(fallback);
        setOpen(true);
      }
    }).catch(() => {
      // git not available, skip
    });
  }, []);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      // 1. Set git global user.name
      await invoke<string>('set_git_username', { name: trimmed });

      // 2. Rename any existing "Me" members in lock files
      const updated = await invoke<number>('rename_lock_member', {
        oldName: 'Me',
        newName: trimmed,
      });

      sessionStorage.setItem('stash-identity-prompted', 'true');
      setOpen(false);

      if (updated > 0) {
        toast.success(t('identity.savedAndUpdated', { name: trimmed, count: updated }));
      } else {
        toast.success(t('identity.saved', { name: trimmed }));
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
  };

  const handleSkip = () => {
    sessionStorage.setItem('stash-identity-prompted', 'true');
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={handleSkip}
      title={t('identity.title')}
      description={t('identity.description')}
      size="sm"
    >
      <div className="identity-prompt__body">
        <div className="identity-prompt__icon">
          <Icon icon={userRound} size="lg" color="currentColor" />
        </div>
        <Input
          size="md"
          variant="outline"
          placeholder={t('identity.placeholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <p className="identity-prompt__hint">{t('identity.hint')}</p>
        <div className="identity-prompt__actions">
          <Button variant="ghost" size="md" onClick={handleSkip}>
            {t('identity.skip')}
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={check}
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? t('identity.saving') : t('identity.save')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
