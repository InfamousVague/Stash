import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Dialog } from '@base/primitives/dialog';
import '@base/primitives/dialog/dialog.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Checkbox } from '@base/primitives/checkbox';
import '@base/primitives/checkbox/checkbox.css';
import { Spinner } from '@base/primitives/spinner';
import '@base/primitives/spinner/spinner.css';
import { check } from '@base/primitives/icon/icons/check';
import { x } from '@base/primitives/icon/icons/x';
import type { PullPreview, ProfilePullDiff } from '../types';
import './PullPreviewDialog.css';

interface PullPreviewDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onApplied: () => void;
}

export function PullPreviewDialog({ open, projectId, onClose, onApplied }: PullPreviewDialogProps) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<PullPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  // Track selected keys per profile: Map<profileName, Set<keyName>>
  const [selected, setSelected] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    setError('');
    setPreview(null);
    invoke<PullPreview>('preview_pull', { projectId })
      .then((data) => {
        setPreview(data);
        // Default: select all added + changed keys
        const sel = new Map<string, Set<string>>();
        for (const profile of data.profiles) {
          const keys = new Set<string>();
          for (const v of profile.added) keys.add(v.key);
          for (const c of profile.changed) keys.add(c.key);
          // Don't select removed by default
          sel.set(profile.name, keys);
        }
        setSelected(sel);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, projectId]);

  const toggleKey = (profile: string, key: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(profile) || []);
      if (set.has(key)) set.delete(key); else set.add(key);
      next.set(profile, set);
      return next;
    });
  };

  const totalSelected = Array.from(selected.values()).reduce((sum, s) => sum + s.size, 0);
  const totalChanges = preview
    ? preview.profiles.reduce((sum, p) => sum + p.added.length + p.changed.length + p.removed.length, 0)
    : 0;

  const handleApply = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      // Build accepted_keys map
      const acceptedKeys: Record<string, string[]> = {};
      for (const [profile, keys] of selected) {
        acceptedKeys[profile] = Array.from(keys);
      }
      await invoke('apply_pull', { projectId, acceptedKeys });
      onApplied();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  };

  const renderProfile = (profile: ProfilePullDiff) => {
    const profileSelected = selected.get(profile.name) || new Set();
    const hasChanges = profile.added.length + profile.removed.length + profile.changed.length > 0;

    if (!hasChanges) return null;

    return (
      <div key={profile.name} className="pull-preview__profile">
        <span className="pull-preview__profile-name">
          .env{profile.name !== 'default' ? `.${profile.name}` : ''}
        </span>

        {profile.added.map((v) => (
          <div key={`add-${v.key}`} className="pull-preview__row pull-preview__row--added">
            <Checkbox
              className="pull-preview__row-check"
              checked={profileSelected.has(v.key)}
              onChange={() => toggleKey(profile.name, v.key)}
            />
            <span className="pull-preview__row-key">{v.key}</span>
            <div className="pull-preview__row-detail">
              <span className="pull-preview__row-label pull-preview__row-label--added">{t('pullPreview.added')}</span>
            </div>
          </div>
        ))}

        {profile.changed.map((c) => (
          <div key={`change-${c.key}`} className="pull-preview__row pull-preview__row--changed">
            <Checkbox
              className="pull-preview__row-check"
              checked={profileSelected.has(c.key)}
              onChange={() => toggleKey(profile.name, c.key)}
            />
            <span className="pull-preview__row-key">{c.key}</span>
            <div className="pull-preview__row-detail">
              <span className="pull-preview__row-label pull-preview__row-label--changed">{t('pullPreview.changed')}</span>
              <div className="pull-preview__row-values">
                <span title={c.local_value}>{'•'.repeat(Math.min(c.local_value.length, 12)) || '(empty)'}</span>
                <span className="pull-preview__row-arrow">&rarr;</span>
                <span title={c.incoming_value}>{'•'.repeat(Math.min(c.incoming_value.length, 12)) || '(empty)'}</span>
              </div>
            </div>
          </div>
        ))}

        {profile.removed.map((key) => (
          <div key={`remove-${key}`} className="pull-preview__row pull-preview__row--removed">
            <Checkbox
              className="pull-preview__row-check"
              checked={profileSelected.has(key)}
              onChange={() => toggleKey(profile.name, key)}
            />
            <span className="pull-preview__row-key">{key}</span>
            <div className="pull-preview__row-detail">
              <span className="pull-preview__row-label pull-preview__row-label--removed">{t('pullPreview.removed')}</span>
            </div>
          </div>
        ))}

        {profile.unchanged > 0 && (
          <div className="pull-preview__unchanged">
            {t('pullPreview.unchangedCount', { count: profile.unchanged })}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('pullPreview.title')}
      description={t('pullPreview.description')}
      size="lg"
    >
      <div className="pull-preview__content">
        {loading && (
          <div className="pull-preview__loading">
            <Spinner size="md" />
          </div>
        )}

        {error && (
          <div className="pull-preview__error">
            {error}
          </div>
        )}

        {preview && totalChanges === 0 && (
          <div className="pull-preview__no-changes">
            {t('pullPreview.noChanges')}
          </div>
        )}

        {preview && preview.profiles.map(renderProfile)}
      </div>

      {preview && totalChanges > 0 && (
        <div className="pull-preview__actions">
          <span className="pull-preview__summary">
            {t('pullPreview.selectedCount', { selected: totalSelected, total: totalChanges })}
          </span>
          <Button variant="ghost" size="md" icon={x} onClick={onClose} disabled={applying}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={check}
            onClick={handleApply}
            disabled={applying || totalSelected === 0}
          >
            {applying ? t('pullPreview.applying') : t('pullPreview.apply')}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
