import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectoryPage } from '../DirectoryPage';

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

// Mock ServiceCard to simplify
vi.mock('../../components/ServiceCard', () => ({
  ServiceCard: ({ service }: { service: { id: string; name: string } }) => (
    <div data-testid={`service-card-${service.id}`}>{service.name}</div>
  ),
}));

describe('DirectoryPage', () => {
  it('renders search input', () => {
    render(<DirectoryPage />);
    expect(screen.getByPlaceholderText('Search services...')).toBeInTheDocument();
  });

  it('renders category filter buttons', () => {
    render(<DirectoryPage />);
    // "All" button should be present
    const allBtn = screen.getByText(/^All/);
    expect(allBtn).toBeInTheDocument();
  });

  it('renders service cards', () => {
    render(<DirectoryPage />);
    // Should render some service cards (page size 20)
    const cards = screen.getAllByTestId(/^service-card-/);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(20);
  });

  it('filters by search query', async () => {
    const user = userEvent.setup();
    render(<DirectoryPage />);

    const searchInput = screen.getByPlaceholderText('Search services...');
    await user.type(searchInput, 'OpenAI');

    // Should show OpenAI card
    expect(screen.getByTestId('service-card-openai')).toBeInTheDocument();
  });

  it('paginates results', () => {
    render(<DirectoryPage />);
    // With 179 services and page size 20, should have pagination
    const pageInfo = screen.getByText(/Page 1 of/);
    expect(pageInfo).toBeInTheDocument();
  });
});
