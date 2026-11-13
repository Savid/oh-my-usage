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

  it("draws each part of a mark, the fainter parts as faint as the owner's", () => {
    render(<ProviderIcon provider="azure" />);

    const parts = [...screen.getByRole('img', { name: 'Azure OpenAI' }).querySelectorAll('path')];
    expect(parts.map(part => part.getAttribute('fill-opacity'))).toEqual(['0.75', '0.5', null]);
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
