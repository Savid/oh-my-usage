import type { JSX } from 'react';
import { formatAge } from '@/lib/format';
import type { SourceAlertsProps } from './SourceAlerts.types';

/**
 * Says when what the page shows is not current: the daemon, the gateway or
 * the broker could not be reached. Renders nothing while all three answer.
 */
export function SourceAlerts({ list, stale, now }: SourceAlertsProps): JSX.Element | null {
  const { gateway, broker } = list;
  const messages: string[] = [];

  if (stale) messages.push('Lost contact with oh-my-usage. This is the last data it sent.');

  if (!gateway.reachable) {
    const since = gateway.updatedAt
      ? `Usage was last read ${formatAge(gateway.updatedAt, now)} ago.`
      : 'No usage has been read yet.';
    messages.push(`The gateway cannot be reached${gateway.error ? ` (${gateway.error})` : ''}. ${since}`);
  }

  if (broker && !broker.reachable) {
    messages.push(
      `The broker cannot be reached${broker.error ? ` (${broker.error})` : ''}. Pause states may be out of date.`
    );
  }

  if (messages.length === 0) return null;

  return (
    <div role="alert" className="flex flex-col gap-1 rounded-md border border-border-strong bg-surface p-4 text-body">
      {messages.map(message => (
        <p key={message} className="text-danger">
          {message}
        </p>
      ))}
    </div>
  );
}
