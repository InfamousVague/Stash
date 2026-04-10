import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { lockKeyhole } from '@base/primitives/icon/icons/lock-keyhole';
import { lockOpen } from '@base/primitives/icon/icons/lock-open';
import { cloudUpload } from '@base/primitives/icon/icons/cloud-upload';
import { cloudDownload } from '@base/primitives/icon/icons/cloud-download';
import { chevronDown } from '@base/primitives/icon/icons/chevron-down';
import { chevronUp } from '@base/primitives/icon/icons/chevron-up';
import { circleCheck } from '@base/primitives/icon/icons/circle-check';
import { circleAlert } from '@base/primitives/icon/icons/circle-alert';
import { circlePlus } from '@base/primitives/icon/icons/circle-plus';
import { circleX } from '@base/primitives/icon/icons/circle-x';
import { refreshCw } from '@base/primitives/icon/icons/refresh-cw';
import { useToastContext } from '../contexts/ToastContext';
import { Tip } from './Tip';
import type { LockSyncStatus, ProfileSyncDetail } from '../types';
import './StashLockPanel.css';

interface StashLockPanelProps {
  projectId: string;
  onSynced?: () => void;
}

export function StashLockPanel({ projectId, onSynced }: StashLockPanelProps) {
  const { t } = useTranslation();
  const toast = useToastContext();
  const [status, setStatus] = useState<LockSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [initialExpandDone, setInitialExpandDone] = useState(false);

  const checkSync = useCallback(async () => {
    try {
      const result = await invoke<LockSyncStatus>('check_lock_sync', { projectId });
      setStatus(result);
      return result;
    } catch {
      setStatus(null);
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    setInitialExpandDone(false);
    checkSync();
  }, [checkSync]);

  // Auto-expand when out of sync on first load
  useEffect(() => {
    if (status && !initialExpandDone) {
      setInitialExpandDone(true);
      if (status.has_lock && !status.in_sync) {
        setExpanded(true);
      }
    }
  }, [status, initialExpandDone]);

  const handlePush = async () => {
    setSyncing(true);
    try {
      await invoke('push_lock', { projectId });
      toast.success(t('lockPanel.pushSuccess'));
      await checkSync();
      onSynced?.();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    setSyncing(true);
    try {
      await invoke('pull_lock', { projectId });
      toast.success(t('lockPanel.pullSuccess'));
      await checkSync();
      onSynced?.();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSyncing(false);
    }
  };

  if (!status) return null;

  // No lock file — show initialization prompt
  if (!status.has_lock) {
    return (
      <div className="lock-panel lock-panel--empty">
        <div className="lock-panel__header">
          <div className="lock-panel__header-left">
            <Icon icon={lockOpen} size="sm" color="currentColor" />
            <span className="lock-panel__label">.stash.lock</span>
            <Badge variant="subtle" size="sm" color="neutral">{t('lockPanel.noLock')}</Badge>
          </div>
          <div className="lock-panel__actions">
            <Tip content={t('lockPanel.initDesc')}>
              <Button
                variant="primary"
                size="sm"
                icon={cloudUpload}
                onClick={handlePush}
                disabled={syncing}
              >
                {t('lockPanel.init')}
              </Button>
            </Tip>
          </div>
        </div>
        <p className="lock-panel__empty-hint">{t('lockPanel.noLockHint')}</p>
      </div>
    );
  }

  const syncedCount = status.profiles.filter(p => p.status === 'synced').length;
  const unsyncedCount = status.profiles.length - syncedCount;
  const totalEnvKeys = status.profiles.reduce((s, p) => s + p.env_key_count, 0);
  const totalLockKeys = status.profiles.reduce((s, p) => s + p.lock_key_count, 0);

  // Determine which action is most relevant
  const hasLocalChanges = status.profiles.some(p => p.status === 'new' || (p.status === 'changed' && p.added_keys.length > 0));
  const hasLockOnlyData = status.profiles.some(p => p.status === 'lock_only' || (p.status === 'changed' && p.removed_keys.length > 0));
  const needsPush = !status.in_sync && hasLocalChanges;
  const needsPull = !status.in_sync && hasLockOnlyData;

  const statusIcon = (p: ProfileSyncDetail) => {
    switch (p.status) {
      case 'synced': return circleCheck;
      case 'changed': return circleAlert;
      case 'new': return circlePlus;
      case 'lock_only': return circleX;
      default: return circleCheck;
    }
  };

  const statusColorClass = (p: ProfileSyncDetail): string => {
    switch (p.status) {
      case 'synced': return 'lock-panel__icon--success';
      case 'changed': return 'lock-panel__icon--warning';
      case 'new': return 'lock-panel__icon--accent';
      case 'lock_only': return 'lock-panel__icon--muted';
      default: return 'lock-panel__icon--muted';
    }
  };

  const statusBadgeColor = (p: ProfileSyncDetail): 'success' | 'warning' | 'accent' | 'neutral' => {
    switch (p.status) {
      case 'synced': return 'success';
      case 'changed': return 'warning';
      case 'new': return 'accent';
      case 'lock_only': return 'neutral';
      default: return 'neutral';
    }
  };

  const statusLabel = (p: ProfileSyncDetail): string => {
    switch (p.status) {
      case 'synced': return t('lockPanel.synced');
      case 'changed': return t('lockPanel.changed');
      case 'new': return t('lockPanel.newProfile');
      case 'lock_only': return t('lockPanel.lockOnly');
      default: return '';
    }
  };

  return (
    <div className={`lock-panel ${status.in_sync ? 'lock-panel--synced' : 'lock-panel--unsynced'}`}>
      {/* Header row */}
      <div className="lock-panel__header">
        <button className="lock-panel__toggle" onClick={() => setExpanded(!expanded)}>
          <Icon icon={lockKeyhole} size="sm" color="currentColor" />
          <span className="lock-panel__label">.stash.lock</span>
          {status.in_sync ? (
            <Badge variant="subtle" size="sm" color="success">{t('lockPanel.synced')}</Badge>
          ) : (
            <Badge variant="subtle" size="sm" color="warning">
              {t('lockPanel.outOfSync', { count: unsyncedCount })}
            </Badge>
          )}
          <Icon icon={expanded ? chevronUp : chevronDown} size="xs" color="currentColor" />
        </button>
        <div className="lock-panel__actions">
          <Tip content={t('common.refresh')}>
            <Button variant="ghost" size="sm" icon={refreshCw} iconOnly onClick={() => checkSync()} disabled={syncing} aria-label={t('common.refresh')} />
          </Tip>
          <Tip content={t('lockPanel.pushDesc')}>
            <Button
              variant={needsPush ? 'primary' : 'ghost'}
              size="sm"
              icon={cloudUpload}
              onClick={handlePush}
              disabled={syncing}
              className={needsPush ? 'lock-panel__push-cta' : undefined}
            >
              {t('lockPanel.push')}
            </Button>
          </Tip>
          <Tip content={t('lockPanel.pullDesc')}>
            <Button
              variant={needsPull && !needsPush ? 'primary' : 'ghost'}
              size="sm"
              icon={cloudDownload}
              onClick={handlePull}
              disabled={syncing}
              className={needsPull ? 'lock-panel__pull-cta' : undefined}
            >
              {t('lockPanel.pull')}
            </Button>
          </Tip>
        </div>
      </div>

      {/* Summary stats row — always visible */}
      <div className="lock-panel__stats">
        <div className="lock-panel__stat">
          <span className="lock-panel__stat-value">{status.profiles.length}</span>
          <span className="lock-panel__stat-label">{status.profiles.length === 1 ? t('lockPanel.profile') : t('lockPanel.profiles')}</span>
        </div>
        <div className="lock-panel__stat-divider" />
        <div className="lock-panel__stat">
          <span className="lock-panel__stat-value">{totalEnvKeys}</span>
          <span className="lock-panel__stat-label">{t('lockPanel.envKeys')}</span>
        </div>
        <div className="lock-panel__stat-divider" />
        <div className="lock-panel__stat">
          <span className="lock-panel__stat-value">{totalLockKeys}</span>
          <span className="lock-panel__stat-label">{t('lockPanel.lockKeys')}</span>
        </div>
        <div className="lock-panel__stat-divider" />
        <div className="lock-panel__stat">
          <span className="lock-panel__stat-value">{status.member_count}</span>
          <span className="lock-panel__stat-label">{status.member_count === 1 ? t('lockPanel.member') : t('lockPanel.members')}</span>
        </div>
      </div>

      {/* Expanded per-profile detail */}
      {expanded && (
        <div className="lock-panel__detail">
          <div className="lock-panel__detail-heading">{t('lockPanel.profileBreakdown')}</div>
          {status.profiles.map((profile) => (
            <div key={profile.name} className={`lock-panel__profile lock-panel__profile--${profile.status}`}>
              <div className="lock-panel__profile-header">
                <span className={statusColorClass(profile)}>
                  <Icon icon={statusIcon(profile)} size="xs" color="currentColor" />
                </span>
                <span className="lock-panel__profile-name">.env.{profile.name}</span>
                <Badge variant="subtle" size="sm" color={statusBadgeColor(profile)}>
                  {statusLabel(profile)}
                </Badge>
                <span className="lock-panel__profile-counts">
                  <span className="lock-panel__count-env">{profile.env_key_count} {t('lockPanel.onDisk')}</span>
                  <span className="lock-panel__count-sep">/</span>
                  <span className="lock-panel__count-lock">{profile.lock_key_count} {t('lockPanel.inLock')}</span>
                </span>
              </div>
              {(profile.added_keys.length > 0 || profile.removed_keys.length > 0) && (
                <div className="lock-panel__profile-diff">
                  {profile.added_keys.length > 0 && (
                    <div className="lock-panel__diff-group">
                      <span className="lock-panel__diff-label lock-panel__diff-label--added">{t('lockPanel.needsPush')}</span>
                      <div className="lock-panel__diff-keys">
                        {profile.added_keys.map((k) => (
                          <span key={k} className="lock-panel__diff-key lock-panel__diff-key--added">+ {k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.removed_keys.length > 0 && (
                    <div className="lock-panel__diff-group">
                      <span className="lock-panel__diff-label lock-panel__diff-label--removed">{t('lockPanel.inLockOnly')}</span>
                      <div className="lock-panel__diff-keys">
                        {profile.removed_keys.map((k) => (
                          <span key={k} className="lock-panel__diff-key lock-panel__diff-key--removed">- {k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {profile.status === 'synced' && (
                <div className="lock-panel__profile-synced-detail">
                  {profile.env_key_count} {profile.env_key_count === 1 ? 'key' : 'keys'} {t('lockPanel.matchedDescription')}
                </div>
              )}
            </div>
          ))}
          {status.profiles.length === 0 && (
            <p className="lock-panel__empty-profiles">{t('lockPanel.noProfiles')}</p>
          )}
        </div>
      )}
    </div>
  );
}
