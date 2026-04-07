import { useEffect } from 'react';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Card } from '@base/primitives/card';
import '@base/primitives/card/card.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { folderOpen } from '@base/primitives/icon/icons/folder-open';
import { scan } from '@base/primitives/icon/icons/scan';
import { trash2 } from '@base/primitives/icon/icons/trash-2';
import { ScanBanner } from '../components/ScanBanner';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { EnvEditor } from '../components/EnvEditor';
import { useScanner } from '../hooks/useScanner';
import { useProjects } from '../hooks/useProjects';
import { useProfiles } from '../hooks/useProfiles';
import { useDirectory } from '../hooks/useDirectory';
import type { EnvFileGroup } from '../types';
import stashIcon from '../assets/stash-icon.png';
import './VaultsPage.css';

export function VaultsPage() {
  const { scanning, progress, results, startScan, dismiss } = useScanner();
  const {
    projects,
    activeProject,
    vars,
    loadProjects,
    importProject,
    selectProject,
    updateVar,
    addVar,
    deleteVar,
    deleteProject,
  } = useProjects();
  const { profiles, activeProfile, loadProfiles, switchProfile, createProfile } = useProfiles();
  const { matchEnvKey } = useDirectory();

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (activeProject) {
      loadProfiles(activeProject.id);
    }
  }, [activeProject, loadProfiles]);

  const handleImport = async (group: EnvFileGroup) => {
    await importProject(group.project_path, group.project_name);
  };

  const handleSwitchProfile = (profileName: string) => {
    if (activeProject) {
      switchProfile(activeProject.id, profileName);
    }
  };

  const handleCreateProfile = (name: string, copyFrom?: string) => {
    if (activeProject) {
      createProfile(activeProject.id, name, copyFrom);
    }
  };

  const handleSelectProject = (id: string) => {
    selectProject(id);
  };

  const showEmpty = !scanning && projects.length === 0 && results.length === 0;
  const showScanResults = !scanning && results.length > 0 && projects.length === 0;

  return (
    <div className="vaults-page">
      {(scanning || progress) && (
        <ScanBanner
          scanning={scanning}
          progress={progress}
          results={results}
          onDismiss={dismiss}
        />
      )}

      {showEmpty && (
        <div className="vaults-page__empty">
          <img src={stashIcon} alt="" className="vaults-page__empty-img" />
          <p className="vaults-page__empty-text">Your environment secrets live here.</p>
          <p className="vaults-page__empty-hint">
            Scan your system to find .env files, or import a project manually.
          </p>
          <Button variant="primary" icon={scan} onClick={startScan}>
            Scan for Environments
          </Button>
        </div>
      )}

      {showScanResults && (
        <div className="vaults-page__scan-results">
          <div className="vaults-page__section-header">
            <h2 className="vaults-page__section-title">Found Environments</h2>
            <p className="vaults-page__section-desc">
              Click import to add a project to your vaults.
            </p>
          </div>
          <div className="vaults-page__scan-grid">
            {results.map((group) => (
              <Card key={group.project_path} variant="outlined" padding="md" interactive>
                <div className="vaults-page__scan-card">
                  <div className="vaults-page__scan-card-header">
                    <Icon icon={folderOpen} size="base" color="secondary" />
                    <span className="vaults-page__scan-card-name">{group.project_name}</span>
                    {group.framework && (
                      <Badge variant="subtle" size="sm" color="accent">
                        {group.framework}
                      </Badge>
                    )}
                  </div>
                  <p className="vaults-page__scan-card-path">{group.project_path}</p>
                  <p className="vaults-page__scan-card-count">
                    {group.env_files.length} env file{group.env_files.length !== 1 ? 's' : ''}
                  </p>
                  <Button variant="primary" size="sm" onClick={() => handleImport(group)}>
                    Import
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="vaults-page__projects">
          <div className="vaults-page__project-list">
            <div className="vaults-page__list-header">
              <span className="vaults-page__list-title">Projects</span>
              <Button variant="ghost" size="sm" icon={scan} onClick={startScan}>
                Scan
              </Button>
            </div>
            {projects.map((p) => (
              <button
                key={p.id}
                className={`vaults-page__project-item ${activeProject?.id === p.id ? 'vaults-page__project-item--active' : ''}`}
                onClick={() => handleSelectProject(p.id)}
              >
                <div className="vaults-page__project-item-top">
                  <span className="vaults-page__project-name">{p.name}</span>
                  {p.framework && (
                    <Badge variant="subtle" size="sm" color="neutral">
                      {p.framework}
                    </Badge>
                  )}
                </div>
                <span className="vaults-page__project-path">{p.path}</span>
              </button>
            ))}
          </div>

          <div className="vaults-page__project-detail">
            {activeProject ? (
              <>
                <div className="vaults-page__detail-header">
                  <h2 className="vaults-page__detail-title">{activeProject.name}</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={trash2}
                    onClick={() => deleteProject(activeProject.id)}
                    aria-label="Delete project"
                  />
                </div>
                <ProfileSwitcher
                  profiles={profiles}
                  activeProfile={activeProfile}
                  onSwitch={handleSwitchProfile}
                  onCreate={handleCreateProfile}
                />
                <EnvEditor
                  vars={vars}
                  onUpdate={updateVar}
                  onAdd={addVar}
                  onDelete={deleteVar}
                  matchEnvKey={matchEnvKey}
                />
              </>
            ) : (
              <div className="vaults-page__detail-empty">
                <p>Select a project to view its environment variables.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
