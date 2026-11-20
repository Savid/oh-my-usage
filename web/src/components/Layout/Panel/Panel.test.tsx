import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { Panel } from './Panel';

describe('Panel', () => {
  it('is a region named by its heading, with a count and words at the end of its head', () => {
    render(
      <Panel title="Clients" count={3} aside="last 7 days">
        <p>body</p>
      </Panel>
    );

    const panel = screen.getByRole('region', { name: 'Clients' });
    expect(panel).toHaveTextContent('Clients3last 7 daysbody');
    expect(screen.getByRole('heading', { level: 2, name: 'Clients' })).toBeInTheDocument();
  });

  it('takes a name of its own over its heading', () => {
    render(
      <Panel title="Accounts" label="Every account">
        <p>body</p>
      </Panel>
    );

    expect(screen.getByRole('region', { name: 'Every account' })).toBeInTheDocument();
  });

  it('is only a frame without a name', () => {
    render(
      <Panel hairline="strong">
        <p>body</p>
      </Panel>
    );

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
