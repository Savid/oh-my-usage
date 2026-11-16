import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test-utils';
import { AccountsToolbar } from './AccountsToolbar';

describe('AccountsToolbar', () => {
  it('names the list, counts it and offers each order, the current one pressed', () => {
    const onOrder = vi.fn();
    render(<AccountsToolbar count={7} order="risk" onOrder={onOrder} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Order accounts by' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Risk' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Used' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Used' }));
    expect(onOrder).toHaveBeenCalledWith('used');
  });
});
