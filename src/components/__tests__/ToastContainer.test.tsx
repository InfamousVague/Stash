import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastContainer } from '../ToastContainer';
import type { ToastMessage } from '../../hooks/useToast';

vi.mock('@base/primitives/toast', () => ({
  Toast: ({ message, onDismiss }: { message: string; onDismiss?: () => void }) => (
    <div role="alert">
      <span>{message}</span>
      {onDismiss && <button onClick={onDismiss} aria-label="Dismiss">X</button>}
    </div>
  ),
}));

describe('ToastContainer', () => {
  const mockToasts: ToastMessage[] = [
    { id: 1, variant: 'success', message: 'Saved successfully' },
    { id: 2, variant: 'error', message: 'Something failed' },
  ];

  it('renders toast messages', () => {
    render(<ToastContainer toasts={mockToasts} onDismiss={vi.fn()} />);
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('calls onDismiss when toast dismissed', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<ToastContainer toasts={mockToasts} onDismiss={onDismiss} />);

    const dismissBtns = screen.getAllByLabelText('Dismiss');
    await user.click(dismissBtns[0]);

    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('returns null when no toasts', () => {
    const { container } = render(<ToastContainer toasts={[]} onDismiss={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
