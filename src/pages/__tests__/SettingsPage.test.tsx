import { render, screen } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { SettingsPage } from '../SettingsPage';

// Mock all base primitives
vi.mock('@base/primitives/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => {
    const { variant: _v, size: _s, icon: _i, iconOnly: _io, intent: _in, ...rest } = props;
    return <button {...rest}>{children as React.ReactNode}</button>;
  },
}));
vi.mock('@base/primitives/separator', () => ({
  Separator: () => <hr />,
}));
vi.mock('@base/primitives/toggle', () => ({
  Toggle: ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <input type="checkbox" checked={checked} onChange={onChange} role="switch" />
  ),
}));
vi.mock('@base/primitives/badge', () => ({
  Badge: ({ children, ...props }: Record<string, unknown>) => {
    const { variant: _v, size: _s, color: _c, ...rest } = props;
    return <span {...rest}>{children as React.ReactNode}</span>;
  },
}));
vi.mock('@base/primitives/progress', () => ({
  Progress: () => <div role="progressbar" />,
}));
vi.mock('@base/primitives/icon/icons/scan', () => ({ scan: 'scan-svg' }));
vi.mock('@base/primitives/icon/icons/lock', () => ({ lock: 'lock-svg' }));
vi.mock('@base/primitives/icon/icons/terminal', () => ({ terminal: 'terminal-svg' }));

// Mock the ToastContext
vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

// Mock ScanBanner to simplify
vi.mock('../../components/ScanBanner', () => ({
  ScanBanner: () => <div data-testid="scan-banner" />,
}));

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === 'check_vault_initialized') return Promise.resolve(true);
    if (cmd === 'check_vault_unlocked') return Promise.resolve(true);
    if (cmd === 'check_cli_installed') return Promise.resolve(false);
    if (cmd === 'get_scan_results') return Promise.resolve([]);
    return Promise.resolve();
  });
  vi.mocked(listen).mockImplementation(() => Promise.resolve(() => {}));
});

describe('SettingsPage', () => {
  it('renders theme toggle', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Dark Mode')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('renders scan button', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Re-scan Directories')).toBeInTheDocument();
  });

  it('renders CLI install button', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Install')).toBeInTheDocument();
  });
});
