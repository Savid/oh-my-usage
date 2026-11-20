import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test-utils';
import { OrderSwitch } from './OrderSwitch';

describe('OrderSwitch', () => {
  it('offers each order, the current one pressed', () => {
    const onOrder = vi.fn();
    render(<OrderSwitch order="priority" onOrder={onOrder} />);

    expect(screen.getByRole('group', { name: 'Order accounts by' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Priority' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Used' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Used' }));
    expect(onOrder).toHaveBeenCalledWith('used');
  });
});
