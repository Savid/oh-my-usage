import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { Notice } from './Notice';

describe('Notice', () => {
  it('says what is wrong, then what it means, as an alert', () => {
    render(<Notice title="Lost contact with oh-my-usage">Showing the last data it sent.</Notice>);

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Lost contact with oh-my-usageShowing the last data it sent.');
    expect(notice).toHaveAttribute('data-tone', 'warn');
    expect(notice).toHaveClass('bg-warn-subtle');
  });

  it('marks danger with its own shape and ground, not only its colour', () => {
    const { container } = render(<Notice tone="danger" title="Could not reach oh-my-usage" />);

    expect(screen.getByRole('alert')).toHaveClass('bg-danger-subtle');
    expect(container.querySelector('svg circle')).toBeInTheDocument();
    expect(screen.getByRole('alert').querySelectorAll('p')).toHaveLength(1);
  });
});
