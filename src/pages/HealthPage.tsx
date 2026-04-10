import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { Progress } from '@base/primitives/progress';
import '@base/primitives/progress/progress.css';
import { search } from '@base/primitives/icon/icons/search';
import { refreshCw } from '@base/primitives/icon/icons/refresh-cw';
import { circleCheck } from '@base/primitives/icon/icons/circle-check';
import { scan } from '@base/primitives/icon/icons/scan';
import { useHealth, type IssueFilter } from '../hooks/useHealth';
import { InfoGuide } from '../components/InfoGuide';
import type { HealthIssue } from '../types';
import { Tip } from '../components/Tip';
import './HealthPage.css';

const SEVERITY_COLOR: Record<string, 'error' | 'warning' | 'neutral'> = {
  critical: 'error',
  warning: 'warning',
  info: 'neutral',
};

const TYPE_LABEL_KEYS: Record<string, string> = {
  stale: 'health.typeStale',
  duplicate: 'health.typeDuplicate',
  overlap: 'health.typeOverlap',
  format: 'health.typeFormat',
  git_exposed: 'health.typeGitExposed',
  expiring: 'health.typeExpiring',
};

const FILTERS: { value: IssueFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'health.filterAll' },
  { value: 'stale', labelKey: 'health.filterStale' },
  { value: 'duplicate', labelKey: 'health.filterDuplicates' },
  { value: 'overlap', labelKey: 'health.filterOverlaps' },
  { value: 'format', labelKey: 'health.filterFormat' },
  { value: 'git_exposed', labelKey: 'health.filterGitExposed' },
  { value: 'expiring', labelKey: 'health.filterExpiring' },
];

function IssueRow({ issue, style }: { issue: HealthIssue; style?: React.CSSProperties }) {
  const { t } = useTranslation();
  return (
    <div className="health-page__issue" style={style}>
      <Badge variant="subtle" size="sm" color={SEVERITY_COLOR[issue.severity] ?? 'neutral'}>
        {t(`health.${issue.severity}` as any)}
      </Badge>
      <Badge variant="subtle" size="sm" color="accent">
        {TYPE_LABEL_KEYS[issue.issue_type] ? t(TYPE_LABEL_KEYS[issue.issue_type]) : issue.issue_type}
      </Badge>
      <code className="health-page__issue-key">{issue.key}</code>
      <span className="health-page__issue-project">{issue.project_name}</span>
      <span className="health-page__issue-details">{issue.details}</span>
    </div>
  );
}

export function HealthPage() {
  const { t } = useTranslation();
  const {
    issues,
    summary,
    loading,
    filter,
    query,
    setFilter,
    setQuery,
    loadReport,
  } = useHealth();

  const [scanningGit, setScanningGit] = useState(false);
  const [gitScanStatus, setGitScanStatus] = useState('');
  const [gitScanProgress, setGitScanProgress] = useState(0);

  // Listen for git scan progress events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ current_project: string; project_index: number; total_projects: number; complete: boolean }>(
      'git-scan-progress',
      (event) => {
        const { current_project, project_index, total_projects, complete } = event.payload;
        if (complete) {
          setScanningGit(false);
          setGitScanStatus('');
          setGitScanProgress(100);
          loadReport();
        } else {
          setGitScanStatus(`Scanning ${current_project}...`);
          setGitScanProgress(Math.round((project_index / total_projects) * 100));
        }
      }
    ).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [loadReport]);

  const scanAllGit = useCallback(async () => {
    setScanningGit(true);
    setGitScanProgress(0);
    setGitScanStatus(t('health.startingGitScan'));
    try {
      await invoke('scan_all_git');
    } catch (err) {
      console.error('Git scan failed:', err);
      setScanningGit(false);
      setGitScanStatus('');
    }
  }, [t]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  return (
    <div className="health-page">
      <div style={{ padding: '16px 24px 0' }}>
        <InfoGuide
          storageKey="stash-guide-health-dismissed"
          titleKey="guide.health.title"
          stepKeys={['guide.health.step1', 'guide.health.step2', 'guide.health.step3', 'guide.health.step4', 'guide.health.step5']}
        />
      </div>
      <div className="health-page__summary">
        <div className={`health-page__stat ${summary.critical > 0 ? 'health-page__stat--critical' : ''}`}>
          <span className={`health-page__stat-value${summary.critical > 0 ? ' health-page__stat-value--critical' : ''}`}>
            {summary.critical}
          </span>
          <span className="health-page__stat-label">{t('health.critical')}</span>
        </div>
        <div className={`health-page__stat ${summary.warning > 0 ? 'health-page__stat--warning' : ''}`}>
          <span className={`health-page__stat-value${summary.warning > 0 ? ' health-page__stat-value--warning' : ''}`}>
            {summary.warning}
          </span>
          <span className="health-page__stat-label">{t('health.warning')}</span>
        </div>
        <div className="health-page__stat health-page__stat--info">
          <span className="health-page__stat-value">{summary.info}</span>
          <span className="health-page__stat-label">{t('health.info')}</span>
        </div>
      </div>

      <div className="health-page__controls">
        <div className="health-page__search-row">
          <div className="health-page__search">
            <Input
              size="md"
              variant="outline"
              iconLeft={search}
              placeholder={t('health.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Tip content={t('common.refresh')}>
            <Button
              variant="ghost"
              size="md"
              iconOnly
              icon={refreshCw}
              onClick={loadReport}
              disabled={loading}
              aria-label={t('common.refresh')}
            />
          </Tip>
          <Button
            variant="ghost"
            size="sm"
            icon={scan}
            onClick={scanAllGit}
            disabled={scanningGit}
          >
            {scanningGit ? gitScanStatus || t('discover.scanning') : t('health.scanGit')}
          </Button>
        </div>
        <div className="health-page__filters">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setFilter(f.value)}
            >
              {t(f.labelKey)}
              {f.value === 'all' ? ` (${summary.total})` : ''}
            </Button>
          ))}
        </div>
      </div>

      {scanningGit && (
        <div className="health-page__scan-progress">
          <Progress size="sm" color="accent" value={gitScanProgress} />
          <span className="health-page__scan-status">{gitScanStatus}</span>
        </div>
      )}

      {issues.length === 0 ? (
        <div className="health-page__empty">
          <Icon icon={circleCheck} size="lg" color="currentColor" />
          <span className="health-page__empty-title">
            {summary.total === 0 ? t('health.allHealthy') : t('health.noMatchingIssues')}
          </span>
          <span className="health-page__empty-hint">
            {summary.total === 0
              ? t('health.noHealthIssues')
              : t('health.adjustFilter')}
          </span>
        </div>
      ) : (
        <div className="health-page__list">
          {issues.map((issue, i) => (
            <IssueRow key={`${issue.project_id}-${issue.key}-${issue.issue_type}-${i}`} issue={issue} style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      )}
    </div>
  );
}
