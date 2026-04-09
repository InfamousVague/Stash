import { useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { HealthReport, HealthIssue, GitExposure } from '../types';

export type IssueFilter = 'all' | 'stale' | 'duplicate' | 'overlap' | 'format' | 'git_exposed' | 'expiring';

export function useHealth() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<IssueFilter>('all');
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<HealthReport>('get_health_report');
      setReport(result);
    } catch (err) {
      console.error('Failed to load health report:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const scanGitHistory = useCallback(
    async (projectId: string) => {
      try {
        setScanning(true);
        await invoke<GitExposure[]>('scan_git_history', { projectId });
        await loadReport();
      } catch (err) {
        console.error('Failed to scan git history:', err);
      } finally {
        setScanning(false);
      }
    },
    [loadReport]
  );

  const issues = useMemo(() => {
    if (!report) return [];
    return report.issues.filter((issue: HealthIssue) => {
      if (filter !== 'all' && issue.issue_type !== filter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (
          !issue.key.toLowerCase().includes(q) &&
          !issue.project_name.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [report, filter, query]);

  const summary = report?.summary ?? { total: 0, critical: 0, warning: 0, info: 0 };

  return {
    report,
    issues,
    summary,
    loading,
    scanning,
    filter,
    query,
    setFilter,
    setQuery,
    loadReport,
    scanGitHistory,
  };
}
