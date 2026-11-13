import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders its label with the requested tone', () => {
    render(<StatusBadge tone="ok">online</StatusBadge>);

    const badge = screen.getByText('online');
    expect(badge).toHaveAttribute('data-tone', 'ok');
    // All is well: the dot carries the tone and the word stays quiet.
    expect(badge).toHaveClass('text-muted');
    expect(badge.querySelector('svg')).toHaveClass('text-ok');
  });

  it('colours the word too when something needs attention', () => {
    render(<StatusBadge tone="danger">failed</StatusBadge>);

    const badge = screen.getByText('failed');
    expect(badge).toHaveClass('text-danger');
    expect(badge.querySelector('svg')).toHaveClass('text-danger');
  });

  it('defaults to neutral', () => {
    render(<StatusBadge>idle</StatusBadge>);

    expect(screen.getByText('idle')).toHaveAttribute('data-tone', 'neutral');
  });
});
