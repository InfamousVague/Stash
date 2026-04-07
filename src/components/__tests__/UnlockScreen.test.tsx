import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnlockScreen } from '../UnlockScreen';

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

describe('UnlockScreen', () => {
  const defaultProps = {
    initialized: false,
    error: '',
    onInit: vi.fn(),
    onUnlock: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Create Vault" when not initialized', () => {
    render(<UnlockScreen {...defaultProps} initialized={false} />);
    expect(screen.getByRole('heading', { name: 'Create Vault' })).toBeInTheDocument();
  });

  it('renders "Unlock Stash" when initialized', () => {
    render(<UnlockScreen {...defaultProps} initialized={true} />);
    expect(screen.getByRole('heading', { name: 'Unlock Stash' })).toBeInTheDocument();
  });

  it('shows error message when error prop set', () => {
    render(<UnlockScreen {...defaultProps} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('calls onInit with password on create', async () => {
    const user = userEvent.setup();
    const onInit = vi.fn();
    render(<UnlockScreen {...defaultProps} initialized={false} onInit={onInit} />);

    const inputs = screen.getAllByPlaceholderText(/password/i);
    await user.type(inputs[0], 'secure-password');
    await user.type(inputs[1], 'secure-password');

    const submitBtn = screen.getByRole('button', { name: /create vault/i });
    await user.click(submitBtn);

    expect(onInit).toHaveBeenCalledWith('secure-password');
  });

  it('calls onUnlock with password on unlock', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn();
    render(<UnlockScreen {...defaultProps} initialized={true} onUnlock={onUnlock} />);

    const input = screen.getByPlaceholderText('Master password');
    await user.type(input, 'my-password');

    const submitBtn = screen.getByRole('button', { name: /unlock/i });
    await user.click(submitBtn);

    expect(onUnlock).toHaveBeenCalledWith('my-password');
  });

  it('shows validation error for short password', async () => {
    const user = userEvent.setup();
    render(<UnlockScreen {...defaultProps} initialized={false} />);

    const inputs = screen.getAllByPlaceholderText(/password/i);
    await user.type(inputs[0], 'abc');
    await user.type(inputs[1], 'abc');

    const submitBtn = screen.getByRole('button', { name: /create vault/i });
    await user.click(submitBtn);

    expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
    expect(defaultProps.onInit).not.toHaveBeenCalled();
  });

  it('shows validation error for mismatched passwords', async () => {
    const user = userEvent.setup();
    render(<UnlockScreen {...defaultProps} initialized={false} />);

    const inputs = screen.getAllByPlaceholderText(/password/i);
    await user.type(inputs[0], 'password123');
    await user.type(inputs[1], 'different456');

    const submitBtn = screen.getByRole('button', { name: /create vault/i });
    await user.click(submitBtn);

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(defaultProps.onInit).not.toHaveBeenCalled();
  });
});
