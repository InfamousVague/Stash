import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ServiceCard } from '../ServiceCard';
import { mockApiService } from '../../test/mocks';

vi.mock('@base/primitives/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => {
    const { variant: _v, size: _s, icon: _i, iconOnly: _io, intent: _in, ...rest } = props;
    return <button {...rest}>{children as React.ReactNode}</button>;
  },
}));
vi.mock('@base/primitives/badge', () => ({
  Badge: ({ children, ...props }: Record<string, unknown>) => {
    const { variant: _v, size: _s, color: _c, ...rest } = props;
    return <span {...rest}>{children as React.ReactNode}</span>;
  },
}));

describe('ServiceCard', () => {
  it('renders service name, category, description', () => {
    render(<ServiceCard service={mockApiService} />);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('AI & ML')).toBeInTheDocument();
    expect(screen.getByText('GPT-4, DALL-E, Whisper, and embeddings APIs')).toBeInTheDocument();
  });

  it('renders env key codes', () => {
    render(<ServiceCard service={mockApiService} />);
    expect(screen.getByText('OPENAI_API_KEY')).toBeInTheDocument();
    expect(screen.getByText('OPENAI_ORG_ID')).toBeInTheDocument();
  });

  it('calls openUrl on Get Key click', async () => {
    const user = userEvent.setup();
    render(<ServiceCard service={mockApiService} />);

    const btn = screen.getByText(/Get Key/);
    await user.click(btn);

    expect(openUrl).toHaveBeenCalledWith('https://platform.openai.com/api-keys');
  });
});
