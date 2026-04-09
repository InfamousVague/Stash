import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import './GitBanner.css';

interface GitStatus {
  is_git_repo: boolean;
  env_tracked: boolean;
  env_in_gitignore: boolean;
}

interface GitBannerProps {
  projectPath: string;
  onFixed?: () => void;
}

export function GitBanner({ projectPath, onFixed }: GitBannerProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [fixing, setFixing] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const result = await invoke<GitStatus>('check_git_status', { projectPath });
      setStatus(result);
    } catch {
      setStatus(null);
    }
  }, [projectPath]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  if (!status || !status.is_git_repo) return null;
  if (status.env_in_gitignore && !status.env_tracked) return null;

  const handleFixGitignore = async () => {
    setFixing(true);
    try {
      await invoke('fix_gitignore', { projectPath });
      await checkStatus();
      onFixed?.();
    } finally {
      setFixing(false);
    }
  };

  const handleRemoveFromGit = async () => {
    setFixing(true);
    try {
      await invoke('remove_env_from_git', { projectPath });
      await checkStatus();
      onFixed?.();
    } finally {
      setFixing(false);
    }
  };

  if (status.env_tracked) {
    return (
      <div className="git-banner git-banner--error">
        <span className="git-banner__text">
          {t('gitBanner.tracked')}
        </span>
        <div className="git-banner__actions">
          <Button variant="ghost" size="sm" onClick={handleRemoveFromGit} disabled={fixing}>
            {t('gitBanner.removeFromGit')}
          </Button>
          {!status.env_in_gitignore && (
            <Button variant="ghost" size="sm" onClick={handleFixGitignore} disabled={fixing}>
              {t('gitBanner.fixGitignore')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!status.env_in_gitignore) {
    return (
      <div className="git-banner git-banner--warning">
        <span className="git-banner__text">
          {t('gitBanner.notIgnored')}
        </span>
        <div className="git-banner__actions">
          <Button variant="ghost" size="sm" onClick={handleFixGitignore} disabled={fixing}>
            {t('gitBanner.fix')}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
