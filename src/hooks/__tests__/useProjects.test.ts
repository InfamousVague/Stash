import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useProjects } from '../useProjects';
import { mockProjects, mockEnvVars } from '../../test/mocks';

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'list_projects') return Promise.resolve(mockProjects);
    if (cmd === 'get_project_vars') return Promise.resolve(mockEnvVars);
    if (cmd === 'get_rotation_info') return Promise.resolve({});
    return Promise.resolve();
  });
});

describe('useProjects', () => {
  it('loadProjects calls invoke and sets state', async () => {
    const { result } = renderHook(() => useProjects());

    await act(async () => {
      await result.current.loadProjects();
    });

    expect(invoke).toHaveBeenCalledWith('list_projects');
    expect(result.current.projects).toEqual(mockProjects);
  });

  it('importProject calls invoke with correct args', async () => {
    const { result } = renderHook(() => useProjects());

    await act(async () => {
      await result.current.importProject('/path/to/project', 'My Project');
    });

    expect(invoke).toHaveBeenCalledWith('import_project', {
      projectPath: '/path/to/project',
      projectName: 'My Project',
    });
  });

  it('selectProject loads vars', async () => {
    const { result } = renderHook(() => useProjects());

    // First load projects so they exist
    await act(async () => {
      await result.current.loadProjects();
    });

    await act(async () => {
      await result.current.selectProject('proj-1');
    });

    expect(invoke).toHaveBeenCalledWith('get_project_vars', { projectId: 'proj-1' });
    expect(result.current.vars).toEqual(mockEnvVars);
    expect(result.current.activeProject).toEqual(mockProjects[0]);
  });

  it('updateVar calls invoke with correct args', async () => {
    const { result } = renderHook(() => useProjects());

    // Load and select a project
    await act(async () => {
      await result.current.loadProjects();
    });
    await act(async () => {
      await result.current.selectProject('proj-1');
    });

    await act(async () => {
      await result.current.updateVar('API_KEY', 'new-value');
    });

    expect(invoke).toHaveBeenCalledWith('update_var', {
      projectId: 'proj-1',
      key: 'API_KEY',
      value: 'new-value',
    });
  });

  it('deleteProject calls invoke and clears active', async () => {
    const { result } = renderHook(() => useProjects());

    // Load and select
    await act(async () => {
      await result.current.loadProjects();
    });
    await act(async () => {
      await result.current.selectProject('proj-1');
    });
    expect(result.current.activeProject).toBeTruthy();

    await act(async () => {
      await result.current.deleteProject('proj-1');
    });

    expect(invoke).toHaveBeenCalledWith('delete_project', { projectId: 'proj-1' });
    expect(result.current.activeProject).toBeNull();
    expect(result.current.vars).toEqual([]);
  });
});
