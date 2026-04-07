import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnvVarRow } from '../EnvVarRow';
import { mockApiService } from '../../test/mocks';

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
vi.mock('@base/primitives/icon/icons/eye', () => ({ eye: 'eye-svg' }));
vi.mock('@base/primitives/icon/icons/eye-off', () => ({ eyeOff: 'eye-off-svg' }));
vi.mock('@base/primitives/icon/icons/trash-2', () => ({ trash2: 'trash-svg' }));

describe('EnvVarRow', () => {
  const defaultProps = {
    envKey: 'API_KEY',
    value: 'secret-value',
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders key and masked value', () => {
    render(<EnvVarRow {...defaultProps} />);
    expect(screen.getByText('API_KEY')).toBeInTheDocument();
    // Input should be type=password (masked)
    const input = screen.getByDisplayValue('secret-value');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('toggles visibility on eye click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EnvVarRow {...defaultProps} />);

    const toggleBtn = screen.getByLabelText('Show value');
    await user.click(toggleBtn);

    const input = screen.getByDisplayValue('secret-value');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('calls onUpdate after debounce', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onUpdate = vi.fn();
    render(<EnvVarRow {...defaultProps} onUpdate={onUpdate} />);

    const input = screen.getByDisplayValue('secret-value');
    await user.clear(input);
    await user.type(input, 'new-value');

    // Advance past the 500ms debounce
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onUpdate).toHaveBeenCalledWith('API_KEY', 'new-value');
  });

  it('calls onDelete on trash click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDelete = vi.fn();
    render(<EnvVarRow {...defaultProps} onDelete={onDelete} />);

    const deleteBtn = screen.getByLabelText('Delete variable');
    await user.click(deleteBtn);

    expect(onDelete).toHaveBeenCalledWith('API_KEY');
  });

  it('shows service badge when matchedService provided', () => {
    render(<EnvVarRow {...defaultProps} matchedService={mockApiService} />);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('shows "Get Key" button when value empty and service matched', () => {
    render(<EnvVarRow {...defaultProps} value="" matchedService={mockApiService} />);
    expect(screen.getByText('Get Key')).toBeInTheDocument();
  });
});
