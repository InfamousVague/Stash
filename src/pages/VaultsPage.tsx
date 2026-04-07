import { useEffect } from 'react';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { folderOpen } from '@base/primitives/icon/icons/folder-open';
import { scan } from '@base/primitives/icon/icons/scan';
import { plus } from '@base/primitives/icon/icons/plus';
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
    projects, activeProject, vars,
    loadProjects, importProject, selectProject,
    updateVar, addVar, deleteVar, deleteProject,
  } = useProjects();
  const { profiles, activeProfile, loadProfiles, switchProfile, createProfile } = useProfiles();
  const { matchEnvKey } = useDirectory();

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => {
    if (activeProject) loadProfiles(activeProject.id);
  }, [activeProject, loadProfiles]);

  const handleImport = async (group: EnvFileGroup) => {
    await importProject(group.project_path, group.project_name);
  };

  const unimportedResults = results.filter(
    (r) => !projects.some((p) => p.path === r.project_path)
  );

  const hasContent = projects.length > 0 || unimportedResults.length > 0;

  return (
    <div className="vaults-page">
      {(scanning || progress) && (
        <ScanBanner scanning={scanning} progress={progress} results={results} onDismiss={dismiss} />
      )}

      {/* Empty state — no projects, no scan results */}
      {!hasContent && !scanning && (
        <div className="vaults-page__empty">
          <img src={stashIcon} alt="" className="vaults-page__empty-img" />
          <p className="vaults-page__empty-text">Your environment secrets live here.</p>
          <p className="vaults-page__empty-hint">Scan your system to find .env files.</p>
          <Button variant="primary" icon={scan} onClick={startScan}>
            Scan for Environments
          </Button>
        </div>
      )}

      {/* Main two-panel layout */}
      {hasContent && (
        <div className="vaults-page__projects">
          {/* Left sidebar: discover + project list */}
          <div className="vaults-page__project-list">
            {/* Discover section */}
            {unimportedResults.length > 0 && (
              <div className="vaults-page__discover">
                <div className="vaults-page__list-header">
                  <span className="vaults-page__list-title">Discovered</span>
                  <Badge variant="subtle" size="sm" color="accent">{unimportedResults.length}</Badge>
                </div>
                {unimportedResults.map((group) => (
                  <div key={group.project_path} className="vaults-page__discover-item">
                    <div className="vaults-page__discover-info">
                      <Icon icon={folderOpen} size="xs" color="tertiary" />
                      <span className="vaults-page__discover-name">{group.project_name}</span>
                    </div>
                    <Button variant="ghost" size="sm" icon={plus} iconOnly onClick={() => handleImport(group)} aria-label="Import" />
                  </div>
                ))}
              </div>
            )}

            {/* Project list */}
            <div className="vaults-page__list-header">
              <span className="vaults-page__list-title">Projects</span>
              <Button variant="ghost" size="sm" icon={scan} onClick={startScan} iconOnly aria-label="Scan" />
            </div>
            {projects.length === 0 && (
              <p className="vaults-page__no-projects">Import a project from above to get started.</p>
            )}
            {projects.map((p) => (
              <button
                key={p.id}
                className={`vaults-page__project-item ${activeProject?.id === p.id ? 'vaults-page__project-item--active' : ''}`}
                onClick={() => selectProject(p.id)}
              >
                <div className="vaults-page__project-item-top">
                  <span className="vaults-page__project-name">{p.name}</span>
                  {p.framework && (
                    <Badge variant="subtle" size="sm" color="neutral">{p.framework}</Badge>
                  )}
                </div>
                <span className="vaults-page__project-path">{p.path}</span>
              </button>
            ))}
          </div>

          {/* Right panel: env editor */}
          <div className="vaults-page__project-detail">
            {activeProject ? (
              <>
                <div className="vaults-page__detail-header">
                  <h2 className="vaults-page__detail-title">{activeProject.name}</h2>
                  <Button
                    variant="ghost" size="sm" iconOnly icon={trash2}
                    onClick={() => deleteProject(activeProject.id)}
                    aria-label="Delete project"
                  />
                </div>
                <ProfileSwitcher
                  profiles={profiles}
                  activeProfile={activeProfile}
                  onSwitch={(name) => activeProject && switchProfile(activeProject.id, name)}
                  onCreate={(name, copyFrom) => activeProject && createProfile(activeProject.id, name, copyFrom)}
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
