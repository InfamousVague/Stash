import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScanBanner } from '../ScanBanner';
import { mockScanResults, mockScanProgress } from '../../test/mocks';

vi.mock('@base/primitives/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => {
    const { variant: _v, size: _s, icon: _i, iconOnly: _io, intent: _in, ...rest } = props;
    return <button {...rest}>{children as React.ReactNode}</button>;
  },
}));
vi.mock('@base/primitives/progress', () => ({
  Progress: () => <div role="progressbar" />,
}));

describe('ScanBanner', () => {
  it('shows scanning state with progress text', () => {
    render(
      <ScanBanner
        scanning={true}
        progress={mockScanProgress}
        results={[]}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/Scanning.../)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // files_found
  });

  it('shows completion state with results count', () => {
    const completeProgress = { ...mockScanProgress, complete: true };
    render(
      <ScanBanner
        scanning={false}
        progress={completeProgress}
        results={mockScanResults}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText('2')).toBeInTheDocument(); // projectCount
  });

  it('calls onDismiss when dismiss clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const completeProgress = { ...mockScanProgress, complete: true };
    render(
      <ScanBanner
        scanning={false}
        progress={completeProgress}
        results={mockScanResults}
        onDismiss={onDismiss}
      />
    );

    const dismissBtn = screen.getByText('Dismiss');
    await user.click(dismissBtn);

    expect(onDismiss).toHaveBeenCalled();
  });

  it('returns null when progress is null', () => {
    const { container } = render(
      <ScanBanner
        scanning={false}
        progress={null}
        results={[]}
        onDismiss={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe('');
  });
});
