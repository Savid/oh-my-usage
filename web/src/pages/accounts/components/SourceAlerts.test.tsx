import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { accountsFixture, neverReachedFixture, unreachableFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { SourceAlerts } from './SourceAlerts';

describe('SourceAlerts', () => {
  it('renders nothing while every source answers', () => {
    const { container } = render(<SourceAlerts list={accountsFixture} stale={false} now={NOW_MS} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('says which source is unreachable, why, and how old the data is, each a warning of its own', () => {
    render(<SourceAlerts list={unreachableFixture} stale={false} now={NOW_MS} />);

    const [gateway, broker] = screen.getAllByRole('alert');
    expect(gateway).toHaveTextContent(
      'The gateway cannot be reachedGET /v1/usage: connection refused. Usage was last read 20 min ago.'
    );
    expect(gateway).toHaveAttribute('data-tone', 'warn');
    expect(broker).toHaveTextContent(
      'The broker cannot be reachedGET /v1/snapshot: HTTP 401: unauthorized. Pause states may be out of date.'
    );
  });

  it('says when nothing has been read yet', () => {
    render(<SourceAlerts list={neverReachedFixture} stale={false} now={NOW_MS} />);

    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('No usage has been read yet.');
  });

  it('says when the daemon itself stopped answering', () => {
    render(<SourceAlerts list={accountsFixture} stale now={NOW_MS} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Lost contact with oh-my-usageShowing the last data it sent.');
  });
});
