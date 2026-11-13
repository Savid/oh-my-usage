import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { ProviderIcon } from './ProviderIcon';

describe('ProviderIcon', () => {
  it("draws a known provider's mark and names it", () => {
    render(<ProviderIcon provider="openai-codex" />);

    const icon = screen.getByRole('img', { name: 'OpenAI Codex' });
    expect(icon).toHaveAttribute('data-mark', 'logo');
    expect(icon.querySelector('path')).toHaveAttribute('fill-rule', 'evenodd');
  });

  it("draws an unknown provider's initial", () => {
    render(<ProviderIcon provider="some-new-provider" />);

    const icon = screen.getByRole('img', { name: 'some-new-provider' });
    expect(icon).toHaveAttribute('data-mark', 'initial');
    expect(icon).toHaveTextContent('S');
  });

  it('hides itself when the name is written beside it', () => {
    const { container } = render(<ProviderIcon provider="anthropic" decorative />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
