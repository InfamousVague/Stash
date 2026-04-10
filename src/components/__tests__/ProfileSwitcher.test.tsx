import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileSwitcher } from '../ProfileSwitcher';

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
vi.mock('@base/primitives/checkbox', () => ({
  Checkbox: (props: Record<string, unknown>) => {
    const { label, ...rest } = props;
    return <label><input type="checkbox" {...rest} />{label as string}</label>;
  },
}));
vi.mock('@base/primitives/dialog', () => ({
  Dialog: ({ children, open, title }: Record<string, unknown>) => {
    if (!open) return null;
    return <div role="dialog"><h2>{title as string}</h2>{children as React.ReactNode}</div>;
  },
}));
vi.mock('@base/primitives/icon/icons/plus', () => ({ plus: 'plus-svg' }));
vi.mock('@base/primitives/icon/icons/x', () => ({ x: 'x-svg' }));
vi.mock('@base/primitives/icon/icons/check', () => ({ check: 'check-svg' }));
vi.mock('@base/primitives/icon/icons/trash-2', () => ({ trash2: 'trash-svg' }));

describe('ProfileSwitcher', () => {
  const defaultProps = {
    profiles: ['default', 'staging', 'production'],
    activeProfile: 'default',
    onSwitch: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all profiles as items', () => {
    render(<ProfileSwitcher {...defaultProps} />);
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('calls onSwitch when non-active profile clicked', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<ProfileSwitcher {...defaultProps} onSwitch={onSwitch} />);

    await user.click(screen.getByText('staging'));
    expect(onSwitch).toHaveBeenCalledWith('staging');
  });

  it('opens new profile dialog', async () => {
    const user = userEvent.setup();
    render(<ProfileSwitcher {...defaultProps} />);

    const newBtn = screen.getByLabelText('New profile');
    await user.click(newBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New Profile')).toBeInTheDocument();
  });
});
