import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnvEditor } from '../EnvEditor';
import { mockEnvVars } from '../../test/mocks';
import type { ApiService } from '../../types';

vi.mock('@base/primitives/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => {
    const { variant: _v, size: _s, icon: _i, iconOnly: _io, intent: _in, ...rest } = props;
    return <button {...rest}>{children as React.ReactNode}</button>;
  },
}));
vi.mock('@base/primitives/input', () => ({
  Input: (props: Record<string, unknown>) => {
    const { variant: _v, size: _s, iconLeft: _il, iconRight: _ir, ...rest } = props;
    return <input {...rest} />;
  },
}));
vi.mock('@base/primitives/badge', () => ({
  Badge: ({ children, ...props }: Record<string, unknown>) => {
    const { variant: _v, size: _s, color: _c, ...rest } = props;
    return <span {...rest}>{children as React.ReactNode}</span>;
  },
}));
vi.mock('@base/primitives/icon/icons/search', () => ({ search: 'search-svg' }));
vi.mock('@base/primitives/icon/icons/plus', () => ({ plus: 'plus-svg' }));

// Mock EnvVarRow to simplify
vi.mock('../EnvVarRow', () => ({
  EnvVarRow: ({ envKey }: { envKey: string }) => <div data-testid={`env-row-${envKey}`}>{envKey}</div>,
}));

describe('EnvEditor', () => {
  const defaultProps = {
    vars: mockEnvVars,
    onUpdate: vi.fn(),
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    matchEnvKey: vi.fn(() => null) as (key: string) => ApiService | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders list of env vars', () => {
    render(<EnvEditor {...defaultProps} />);
    mockEnvVars.forEach((v) => {
      expect(screen.getByTestId(`env-row-${v.key}`)).toBeInTheDocument();
    });
  });

  it('filters vars by search input', async () => {
    const user = userEvent.setup();
    render(<EnvEditor {...defaultProps} />);

    const filterInput = screen.getByPlaceholderText('Filter variables...');
    await user.type(filterInput, 'OPENAI');

    expect(screen.getByTestId('env-row-OPENAI_API_KEY')).toBeInTheDocument();
    expect(screen.queryByTestId('env-row-DATABASE_URL')).not.toBeInTheDocument();
  });

  it('adds new variable on form submit', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<EnvEditor {...defaultProps} onAdd={onAdd} />);

    const keyInput = screen.getByPlaceholderText('KEY_NAME');
    const valueInput = screen.getByPlaceholderText('value');

    await user.type(keyInput, 'NEW_KEY');
    await user.type(valueInput, 'new-value');

    const addBtn = screen.getByText('Add');
    await user.click(addBtn);

    expect(onAdd).toHaveBeenCalledWith('NEW_KEY', 'new-value');
  });

  it('shows empty state when no vars', () => {
    render(<EnvEditor {...defaultProps} vars={[]} />);
    expect(screen.getByText('No environment variables yet.')).toBeInTheDocument();
  });

  it('shows framework suggestions when framework provided', () => {
    render(<EnvEditor {...defaultProps} vars={[]} framework="next" />);
    expect(screen.getByText(/Suggested for next/)).toBeInTheDocument();
  });
});
