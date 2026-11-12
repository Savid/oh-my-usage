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

  it('says which source is unreachable, why, and how old the data is', () => {
    render(<SourceAlerts list={unreachableFixture} stale={false} now={NOW_MS} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'The gateway cannot be reached (GET /v1/usage: connection refused). Usage was last read 20 min ago.'
    );
    expect(alert).toHaveTextContent(
      'The broker cannot be reached (GET /v1/snapshot: HTTP 401: unauthorized). Pause states may be out of date.'
    );
  });

  it('says when nothing has been read yet', () => {
    render(<SourceAlerts list={neverReachedFixture} stale={false} now={NOW_MS} />);

    expect(screen.getByRole('alert')).toHaveTextContent('No usage has been read yet.');
  });

  it('says when the daemon itself stopped answering', () => {
    render(<SourceAlerts list={accountsFixture} stale now={NOW_MS} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Lost contact with oh-my-usage. This is the last data it sent.'
    );
  });
});
