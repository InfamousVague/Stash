import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Project, EnvVar } from '../types';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<Project[]>('list_projects');
      setProjects(result);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const importProject = useCallback(async (path: string, name: string) => {
    try {
      await invoke('import_project', { path, name });
      await loadProjects();
    } catch (err) {
      console.error('Failed to import project:', err);
    }
  }, [loadProjects]);

  const selectProject = useCallback(async (id: string) => {
    const project = projects.find((p) => p.id === id) ?? null;
    setActiveProject(project);
    if (project) {
      try {
        const result = await invoke<EnvVar[]>('get_project_vars', { projectId: id });
        setVars(result);
      } catch (err) {
        console.error('Failed to load project vars:', err);
        setVars([]);
      }
    } else {
      setVars([]);
    }
  }, [projects]);

  const updateVar = useCallback(async (key: string, value: string) => {
    if (!activeProject) return;
    try {
      await invoke('update_var', { projectId: activeProject.id, key, value });
    } catch (err) {
      console.error('Failed to update var:', err);
    }
  }, [activeProject]);

  const addVar = useCallback(async (key: string, value: string) => {
    if (!activeProject) return;
    try {
      await invoke('add_var', { projectId: activeProject.id, key, value });
      setVars((prev) => [...prev, { key, value }]);
    } catch (err) {
      console.error('Failed to add var:', err);
    }
  }, [activeProject]);

  const deleteVar = useCallback(async (key: string) => {
    if (!activeProject) return;
    try {
      await invoke('delete_var', { projectId: activeProject.id, key });
      setVars((prev) => prev.filter((v) => v.key !== key));
    } catch (err) {
      console.error('Failed to delete var:', err);
    }
  }, [activeProject]);

  const deleteProject = useCallback(async (id: string) => {
    try {
      await invoke('delete_project', { projectId: id });
      if (activeProject?.id === id) {
        setActiveProject(null);
        setVars([]);
      }
      await loadProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  }, [activeProject, loadProjects]);

  return {
    projects,
    activeProject,
    vars,
    loading,
    loadProjects,
    importProject,
    selectProject,
    updateVar,
    addVar,
    deleteVar,
    deleteProject,
  };
}
