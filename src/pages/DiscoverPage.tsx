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
import { check } from '@base/primitives/icon/icons/check';
import { ScanBanner } from '../components/ScanBanner';
import { useScanner } from '../hooks/useScanner';
import { useProjects } from '../hooks/useProjects';
import stashIcon from '../assets/stash-icon.png';
import './DiscoverPage.css';

interface DiscoverPageProps {
  onNavigateToVaults?: (projectId: string) => void;
}

export function DiscoverPage({ onNavigateToVaults }: DiscoverPageProps) {
  const { scanning, progress, results, startScan, dismiss } = useScanner();
  const { projects, importProject, loadProjects, selectProject } = useProjects();

  const handleImport = async (path: string, name: string) => {
    await importProject(path, name);
    await loadProjects();
  };

  const handleOpen = (projectPath: string) => {
    const project = projects.find((p) => p.path === projectPath);
    if (project && onNavigateToVaults) {
      selectProject(project.id);
      onNavigateToVaults(project.id);
    }
  };

  const isImported = (path: string) => projects.some((p) => p.path === path);
  const unimportedCount = results.filter((r) => !isImported(r.project_path)).length;

  return (
    <div className="discover-page">
      {(scanning || progress) && (
        <ScanBanner scanning={scanning} progress={progress} results={results} onDismiss={dismiss} />
      )}

      <div className="discover-page__toolbar">
        <Button variant="primary" icon={scan} onClick={startScan} disabled={scanning}>
          {scanning ? 'Scanning...' : 'Scan for Environments'}
        </Button>
        {results.length > 0 && (
          <span className="discover-page__stats">
            {results.length} found · {unimportedCount} available to import · {results.length - unimportedCount} imported
          </span>
        )}
      </div>

      {results.length === 0 && !scanning && (
        <div className="discover-page__empty">
          <img src={stashIcon} alt="" className="discover-page__empty-img" />
          <p className="discover-page__empty-text">No environments discovered yet.</p>
          <p className="discover-page__empty-hint">
            Hit scan to search your development directories for .env files.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="discover-page__grid">
          {results.map((group) => {
            const imported = isImported(group.project_path);
            return (
              <div key={group.project_path} className={`discover-page__card ${imported ? 'discover-page__card--imported' : ''}`}>
                <div className="discover-page__card-header">
                  <Icon icon={folderOpen} size="base" color="secondary" />
                  <span className="discover-page__card-name">{group.project_name}</span>
                  {group.framework && (
                    <Badge variant="subtle" size="sm" color="accent">{group.framework}</Badge>
                  )}
                  {imported && (
                    <Badge variant="subtle" size="sm" color="success">Imported</Badge>
                  )}
                </div>
                <p className="discover-page__card-path">{group.project_path}</p>
                <div className="discover-page__card-files">
                  {group.env_files.map((f) => (
                    <code key={f.path} className="discover-page__card-file">{f.filename}</code>
                  ))}
                </div>
                <div className="discover-page__card-footer">
                  {imported ? (
                    <Button variant="secondary" size="md" icon={externalLink} onClick={() => handleOpen(group.project_path)}>
                      Open in Vaults
                    </Button>
                  ) : (
                    <Button variant="primary" size="md" icon={plus} onClick={() => handleImport(group.project_path, group.project_name)}>
                      Import
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
