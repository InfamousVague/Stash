import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Separator } from '@base/primitives/separator';
import '@base/primitives/separator/separator.css';
import { SegmentedControl } from '@base/primitives/segmented-control';
import '@base/primitives/segmented-control/segmented-control.css';
import { Toggle } from '@base/primitives/toggle';
import '@base/primitives/toggle/toggle.css';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { shieldCheck } from '@base/primitives/icon/icons/shield-check';
import { refreshCw } from '@base/primitives/icon/icons/refresh-cw';
import { gitBranch } from '@base/primitives/icon/icons/git-branch';
import { fileText } from '@base/primitives/icon/icons/file-text';
import { lock } from '@base/primitives/icon/icons/lock';
import { useLockMetadata } from '../hooks/useLockMetadata';
import { useToastContext } from '../contexts/ToastContext';
import type { LockSyncStatus } from '../types';
import './ProjectSettings.css';

interface ProjectSettingsProps {
  projectId: string;
  projectPath: string;
}

/** Metadata keys stored in .stash.lock */
const META = {
  ENCRYPTION_ALGO: 'encryption_algorithm',
  KEY_DERIVATION: 'key_derivation',
  ROTATION_DAYS: 'rotation_reminder_days',
  SENSITIVE_KEYS: 'sensitive_key_patterns',
  AUTO_PUSH: 'auto_push_on_change',
  REQUIRE_ALL_PROFILES: 'require_all_profiles_synced',
  GIT_HOOK_PUSH: 'git_hook_pre_commit_push',
  NOTES: 'project_notes',
} as const;

export function ProjectSettings({ projectId, projectPath }: ProjectSettingsProps) {
  const { t } = useTranslation();
  const toast = useToastContext();
  const meta = useLockMetadata(projectId);
  const [lockStatus, setLockStatus] = useState<LockSyncStatus | null>(null);
  const [hasLock, setHasLock] = useState(false);

  useEffect(() => {
    meta.load();
    invoke<LockSyncStatus>('check_lock_sync', { projectId })
      .then((s) => { setLockStatus(s); setHasLock(s.has_lock); })
      .catch(() => setHasLock(false));
  }, [projectId]);

  const saveMeta = useCallback(async (key: string, value: unknown) => {
    try {
      await meta.set(key, value);
      toast.success(t('projectSettings.saved'));
    } catch {
      toast.error(t('projectSettings.saveFailed'));
    }
  }, [meta, toast, t]);

  // Current values from metadata with defaults
  const encryptionAlgo = meta.get<string>(META.ENCRYPTION_ALGO, 'aes-256-gcm');
  const keyDerivation = meta.get<string>(META.KEY_DERIVATION, 'x25519-sha256');
  const rotationDays = meta.get<number>(META.ROTATION_DAYS, 90);
  const sensitivePatterns = meta.get<string>(META.SENSITIVE_KEYS, 'SECRET,PASSWORD,TOKEN,PRIVATE,KEY');
  const autoPush = meta.get<boolean>(META.AUTO_PUSH, false);
  const requireAllSynced = meta.get<boolean>(META.REQUIRE_ALL_PROFILES, false);
  const gitHookPush = meta.get<boolean>(META.GIT_HOOK_PUSH, false);
  const projectNotes = meta.get<string>(META.NOTES, '');

  if (!hasLock) {
    return (
      <div className="project-settings">
        <div className="project-settings__empty">
          <Icon icon={lock} size="lg" color="tertiary" />
          <p className="project-settings__empty-text">{t('projectSettings.noLock')}</p>
          <p className="project-settings__empty-hint">{t('projectSettings.noLockHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="project-settings">
      {/* Lock file badges — minimal */}
      <div className="project-settings__lock-badges">
        <Badge variant="subtle" size="sm" color="neutral">v{lockStatus?.version ?? '?'}</Badge>
        <Badge variant="subtle" size="sm" color="accent">AES-256-GCM</Badge>
        <Badge variant="subtle" size="sm" color="accent">X25519 ECDH</Badge>
        <Badge variant="subtle" size="sm" color="neutral">{lockStatus?.member_count ?? 0} {(lockStatus?.member_count ?? 0) === 1 ? 'member' : 'members'}</Badge>
        <Badge variant="subtle" size="sm" color="neutral">{lockStatus?.profiles.length ?? 0} {(lockStatus?.profiles.length ?? 0) === 1 ? 'profile' : 'profiles'}</Badge>
      </div>

      <Separator />

      {/* ── Encryption & Security ─────────────────────── */}
      <section className="project-settings__section">
        <div className="project-settings__section-header">
          <Icon icon={shieldCheck} size="sm" color="currentColor" />
          <h3 className="project-settings__section-title">{t('projectSettings.encryption')}</h3>
        </div>

        <div className="project-settings__row">
          <div className="project-settings__row-info">
            <span className="project-settings__row-label">{t('projectSettings.symmetricCipher')}</span>
            <span className="project-settings__row-desc">{t('projectSettings.symmetricCipherDesc')}</span>
          </div>
          <SegmentedControl
            size="sm"
            value={encryptionAlgo}
            onChange={(v) => saveMeta(META.ENCRYPTION_ALGO, v)}
            options={[
              { value: 'aes-256-gcm', label: 'AES-256-GCM' },
              { value: 'chacha20-poly1305', label: 'ChaCha20', disabled: true },
            ]}
          />
        </div>

        <div className="project-settings__row">
          <div className="project-settings__row-info">
            <span className="project-settings__row-label">{t('projectSettings.keyExchange')}</span>
            <span className="project-settings__row-desc">{t('projectSettings.keyExchangeDesc')}</span>
          </div>
          <SegmentedControl
            size="sm"
            value={keyDerivation}
            onChange={(v) => saveMeta(META.KEY_DERIVATION, v)}
            options={[
              { value: 'x25519-sha256', label: 'X25519' },
              { value: 'x448-sha512', label: 'X448', disabled: true },
            ]}
          />
        </div>

        <div className="project-settings__row">
          <div className="project-settings__row-info">
            <span className="project-settings__row-label">{t('projectSettings.rotationReminder')}</span>
            <span className="project-settings__row-desc">{t('projectSettings.rotationReminderDesc')}</span>
          </div>
          <SegmentedControl
            size="sm"
            value={String(rotationDays)}
            onChange={(v) => saveMeta(META.ROTATION_DAYS, Number(v))}
            options={[
              { value: '30', label: '30d' },
              { value: '60', label: '60d' },
              { value: '90', label: '90d' },
              { value: '180', label: '180d' },
            ]}
          />
        </div>

        <div className="project-settings__row">
          <div className="project-settings__row-info">
            <span className="project-settings__row-label">{t('projectSettings.sensitivePatterns')}</span>
            <span className="project-settings__row-desc">{t('projectSettings.sensitivePatternsDesc')}</span>
          </div>
          <Input
            size="sm"
            variant="outline"
            value={sensitivePatterns}
            onChange={(e) => saveMeta(META.SENSITIVE_KEYS, e.target.value)}
            placeholder="SECRET,PASSWORD,TOKEN"
            style={{ fontFamily: 'var(--font-mono)', maxWidth: 260 }}
          />
        </div>
      </section>

      <Separator />

      {/* ── Sync & Workflow ───────────────────────────── */}
      <section className="project-settings__section">
        <div className="project-settings__section-header">
          <Icon icon={refreshCw} size="sm" color="currentColor" />
          <h3 className="project-settings__section-title">{t('projectSettings.syncPreferences')}</h3>
        </div>

        <div className="project-settings__row">
          <div className="project-settings__row-info">
            <span className="project-settings__row-label">{t('projectSettings.autoPush')}</span>
            <span className="project-settings__row-desc">{t('projectSettings.autoPushDesc')}</span>
          </div>
          <Toggle
            size="sm"
            checked={autoPush}
            onChange={(e) => saveMeta(META.AUTO_PUSH, e.target.checked)}
          />
        </div>

        <div className="project-settings__row">
          <div className="project-settings__row-info">
            <span className="project-settings__row-label">{t('projectSettings.requireAllSynced')}</span>
            <span className="project-settings__row-desc">{t('projectSettings.requireAllSyncedDesc')}</span>
          </div>
          <Toggle
            size="sm"
            checked={requireAllSynced}
            onChange={(e) => saveMeta(META.REQUIRE_ALL_PROFILES, e.target.checked)}
          />
        </div>

        <div className="project-settings__row">
          <div className="project-settings__row-info">
            <span className="project-settings__row-label">{t('projectSettings.gitHookPush')}</span>
            <span className="project-settings__row-desc">{t('projectSettings.gitHookPushDesc')}</span>
          </div>
          <Toggle
            size="sm"
            checked={gitHookPush}
            onChange={(e) => saveMeta(META.GIT_HOOK_PUSH, e.target.checked)}
          />
        </div>
      </section>

      <Separator />

      {/* ── Project Notes ─────────────────────────────── */}
      <section className="project-settings__section">
        <div className="project-settings__section-header">
          <Icon icon={fileText} size="sm" color="currentColor" />
          <h3 className="project-settings__section-title">{t('projectSettings.projectNotes')}</h3>
        </div>
        <p className="project-settings__hint">{t('projectSettings.projectNotesDesc')}</p>
        <textarea
          className="project-settings__notes"
          value={projectNotes}
          onChange={(e) => saveMeta(META.NOTES, e.target.value)}
          placeholder={t('projectSettings.notesPlaceholder')}
          rows={4}
        />
      </section>

      {/* Path footer */}
      <div className="project-settings__footer">
        <Icon icon={gitBranch} size="xs" color="tertiary" />
        <code className="project-settings__path">{projectPath}/.stash.lock</code>
      </div>
    </div>
  );
}
