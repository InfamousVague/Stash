import { useState, useEffect, useCallback, useRef } from 'react';
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
import { clock } from '@base/primitives/icon/icons/clock';
import { useToastContext } from '../contexts/ToastContext';
import { Tip } from './Tip';
import { PullPreviewDialog } from './PullPreviewDialog';
import type { LockSyncStatus, ProfileSyncDetail, ChangelogEntry } from '../types';
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
  const [pullPreviewOpen, setPullPreviewOpen] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogLoaded, setChangelogLoaded] = useState(false);

  const syncVersionRef = useRef(0);

  const checkSync = useCallback(async () => {
    const version = ++syncVersionRef.current;
    try {
      const result = await invoke<LockSyncStatus>('check_lock_sync', { projectId });
      if (version === syncVersionRef.current) setStatus(result);
      return result;
    } catch {
      if (version === syncVersionRef.current) setStatus(null);
      return null;
    }
  }, [projectId]);

  const loadChangelog = useCallback(async () => {
    try {
      const entries = await invoke<ChangelogEntry[]>('get_lock_changelog', { projectId });
      setChangelog(entries);
      setChangelogLoaded(true);
    } catch {
      setChangelog([]);
      setChangelogLoaded(true);
    }
  }, [projectId]);

  const toggleChangelog = () => {
    if (!changelogOpen && !changelogLoaded) {
      loadChangelog();
    }
    setChangelogOpen(!changelogOpen);
  };

  useEffect(() => {
    setInitialExpandDone(false);
    setChangelogLoaded(false);
    setChangelogOpen(false);
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

  const handlePull = () => {
    setPullPreviewOpen(true);
  };

  const handlePullApplied = async () => {
    toast.success(t('lockPanel.pullSuccess'));
    await checkSync();
    onSynced?.();
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

  const STATUS_CONFIG: Record<string, {
    icon: string;
    colorClass: string;
    badgeColor: 'success' | 'warning' | 'accent' | 'neutral';
    labelKey: string;
  }> = {
    synced:    { icon: circleCheck, colorClass: 'lock-panel__icon--success', badgeColor: 'success', labelKey: 'lockPanel.synced' },
    changed:   { icon: circleAlert, colorClass: 'lock-panel__icon--warning', badgeColor: 'warning', labelKey: 'lockPanel.changed' },
    new:       { icon: circlePlus,  colorClass: 'lock-panel__icon--accent',  badgeColor: 'accent',  labelKey: 'lockPanel.newProfile' },
    lock_only: { icon: circleX,     colorClass: 'lock-panel__icon--muted',   badgeColor: 'neutral', labelKey: 'lockPanel.lockOnly' },
  };

  const getStatusConfig = (p: ProfileSyncDetail) =>
    STATUS_CONFIG[p.status] ?? STATUS_CONFIG.synced;

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
                <span className={getStatusConfig(profile).colorClass}>
                  <Icon icon={getStatusConfig(profile).icon} size="xs" color="currentColor" />
                </span>
                <span className="lock-panel__profile-name">.env.{profile.name}</span>
                <Badge variant="subtle" size="sm" color={getStatusConfig(profile).badgeColor}>
                  {t(getStatusConfig(profile).labelKey)}
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
                  {t('lockPanel.keysMatched', { count: profile.env_key_count })}
                </div>
              )}
            </div>
          ))}
          {status.profiles.length === 0 && (
            <p className="lock-panel__empty-profiles">{t('lockPanel.noProfiles')}</p>
          )}
        </div>
      )}

      {/* Recent Activity (changelog) */}
      {status.has_lock && (
        <div className="lock-panel__changelog">
          <button className="lock-panel__changelog-toggle" onClick={toggleChangelog}>
            <Icon icon={clock} size="xs" color="currentColor" />
            <span>{t('lockPanel.recentActivity')}</span>
            <Icon icon={changelogOpen ? chevronUp : chevronDown} size="xs" color="currentColor" />
          </button>
          {changelogOpen && (
            <div className="lock-panel__changelog-list">
              {changelog.length === 0 && changelogLoaded && (
                <p className="lock-panel__changelog-empty">{t('lockPanel.noActivity')}</p>
              )}
              {changelog.map((entry) => (
                <div key={entry.hash} className="lock-panel__changelog-entry">
                  <code className="lock-panel__changelog-hash">{entry.hash.slice(0, 7)}</code>
                  <span className="lock-panel__changelog-author">{entry.author}</span>
                  <span className="lock-panel__changelog-date">{entry.date}</span>
                  <span className="lock-panel__changelog-msg">{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <PullPreviewDialog
        open={pullPreviewOpen}
        projectId={projectId}
        onClose={() => setPullPreviewOpen(false)}
        onApplied={handlePullApplied}
      />
    </div>
  );
}
