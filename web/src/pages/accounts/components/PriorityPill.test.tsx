import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { PriorityPill } from './PriorityPill';

describe('PriorityPill', () => {
  it('says the place and why, in blue when the gateway picks it', () => {
    render(<PriorityPill priority={{ standing: 'ranked', rank: 2, reason: '60% left', position: 1 }} />);

    const pill = screen.getByTestId('priority');
    expect(pill).toHaveTextContent('Gateway pick: 2nd · 60% left');
    expect(pill).toHaveClass('text-info');
  });

  it('is grey for one held back, and can leave the reason to a badge', () => {
    render(<PriorityPill priority={{ standing: 'last', reason: 'paused', position: 3 }} reason="never" />);

    const pill = screen.getByTestId('priority');
    expect(pill).toHaveClass('text-muted');
    expect(pill).toHaveTextContent(/^Gateway pick: last$/);
  });

  it('keeps the reason for a wide screen and a screen reader', () => {
    render(<PriorityPill priority={{ standing: 'later', reason: 'under 10%', position: 2 }} reason="wide" />);

    expect(screen.getByText('· under 10%', { exact: false })).toHaveClass('sr-only', 'lg:not-sr-only');
  });
});
