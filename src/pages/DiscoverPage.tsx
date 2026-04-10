import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { folderOpen } from '@base/primitives/icon/icons/folder-open';
import { scan } from '@base/primitives/icon/icons/scan';
import { plus } from '@base/primitives/icon/icons/plus';
import { externalLink } from '@base/primitives/icon/icons/external-link';
import { ScanBanner } from '../components/ScanBanner';
import { useScanner } from '../hooks/useScanner';
import { useProjects } from '../hooks/useProjects';
import { FrameworkChip } from '../components/FrameworkChip';
import stashIcon from '../assets/stash-icon.png';
import './DiscoverPage.css';

interface DiscoverPageProps {
  onNavigateToVaults?: (projectId: string) => void;
}

export function DiscoverPage({ onNavigateToVaults }: DiscoverPageProps) {
  const { t } = useTranslation();
  const { scanning, progress, results, startScan, dismiss } = useScanner();
  const { projects, importProject, loadProjects } = useProjects();

  useEffect(() => { loadProjects(); }, [loadProjects]);
  // Auto-scan on first mount if no results yet
  useEffect(() => {
    if (results.length === 0 && !scanning) {
      startScan();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImport = async (path: string, name: string) => {
    await importProject(path, name);
    await loadProjects();
  };

  const handleOpen = (projectPath: string) => {
    const project = projects.find((p) => p.path === projectPath);
    if (project && onNavigateToVaults) {
      // Store the project ID so VaultsPage can pick it up
      localStorage.setItem('stash-select-project', project.id);
      onNavigateToVaults(project.id);
    }
  };

  const isImported = (path: string) => projects.some((p) => p.path === path);
  const unimportedCount = results.filter((r) => !isImported(r.project_path)).length;

  return (
    <div className="discover-page">
      <div className="discover-page__toolbar">
        <Button variant="primary" icon={scan} onClick={startScan} disabled={scanning}>
          {scanning ? t('discover.scanning') : t('discover.scanForEnvs')}
        </Button>
        <span className="discover-page__stats">
          {results.length > 0
            ? t('discover.stats', { found: results.length, available: unimportedCount, imported: results.length - unimportedCount })
            : scanning ? t('discover.scanning') : t('discover.noResults')}
        </span>
      </div>
      {(scanning || progress) && (
        <ScanBanner scanning={scanning} progress={progress} results={results} onDismiss={dismiss} />
      )}

      {results.length === 0 && !scanning && (
        <div className="discover-page__empty">
          <img src={stashIcon} alt="" className="discover-page__empty-img" />
          <p className="discover-page__empty-text">{t('discover.emptyTitle')}</p>
          <p className="discover-page__empty-hint">
            {t('discover.emptyHint')}
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="discover-page__grid">
          {results.map((group, i) => {
            const imported = isImported(group.project_path);
            return (
              <div key={group.project_path} className={`discover-page__card ${imported ? 'discover-page__card--imported' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
                <div className="discover-page__card-header">
                  <Icon icon={folderOpen} size="base" color="secondary" />
                  <span className="discover-page__card-name">{group.project_name}</span>
                  {group.framework && <FrameworkChip framework={group.framework} />}
                  {imported && (
                    <Badge variant="subtle" size="sm" color="success">{t('discover.imported')}</Badge>
                  )}
                </div>
                <p className="discover-page__card-path" title={group.project_path}>
                  {group.project_path.replace(/^\/Users\/[^/]+\//, '~/')}
                </p>
                <div className="discover-page__card-files">
                  {group.env_files.map((f) => (
                    <code key={f.path} className="discover-page__card-file">{f.filename}</code>
                  ))}
                </div>
                <div className="discover-page__card-footer">
                  {imported ? (
                    <Button variant="secondary" size="md" icon={externalLink} onClick={() => handleOpen(group.project_path)}>
                      {t('discover.openInVaults')}
                    </Button>
                  ) : (
                    <Button variant="primary" size="md" icon={plus} onClick={() => handleImport(group.project_path, group.project_name)}>
                      {t('discover.import')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
