import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('frames the page with no bar of its own', () => {
    render(
      <AppShell name="oh-my-usage" connection="live">
        <p>page body</p>
      </AppShell>
    );

    expect(screen.getByRole('main')).toHaveTextContent('page body');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });
});
