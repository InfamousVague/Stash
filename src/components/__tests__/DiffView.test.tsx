import { render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { DiffView } from '../DiffView';

vi.mock('@base/primitives/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => {
    const { variant: _v, size: _s, icon: _i, iconOnly: _io, intent: _in, ...rest } = props;
    return <button {...rest}>{children as React.ReactNode}</button>;
  },
}));
vi.mock('@base/primitives/select', () => ({
  Select: ({ children, ...props }: Record<string, unknown>) => {
    const { variant: _v, size: _s, ...rest } = props;
    return <select {...rest}>{children as React.ReactNode}</select>;
  },
}));

const mockDiffEntries = [
  { key: 'API_KEY', left_value: 'abc', right_value: 'xyz', status: 'changed' },
  { key: 'DB_URL', left_value: 'postgres://a', right_value: null, status: 'left_only' },
  { key: 'PORT', left_value: '3000', right_value: '3000', status: 'same' },
];

describe('DiffView', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'diff_profiles') return Promise.resolve(mockDiffEntries);
      return Promise.resolve();
    });
  });

  it('renders profile selectors', () => {
    render(<DiffView projectId="proj-1" profiles={['default', 'staging']} />);
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
  });

  it('shows diff results after invoke', async () => {
    render(<DiffView projectId="proj-1" profiles={['default', 'staging']} />);

    await waitFor(() => {
      expect(screen.getByText(/2 difference/)).toBeInTheDocument();
    });
  });
});
