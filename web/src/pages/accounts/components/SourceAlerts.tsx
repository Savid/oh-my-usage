import type { JSX } from 'react';
import { Notice } from '@/components/Feedback/Notice';
import { formatAge } from '@/lib/format';
import type { SourceAlertsProps } from './SourceAlerts.types';

interface Trouble {
  title: string;
  detail: string;
}

/**
 * Says when what the page shows is not current: the daemon, the gateway or
 * the broker could not be reached. Each is a notice of its own: the page still
 * shows what was last read, so each is a warning. Renders nothing while all
 * three answer.
 */
export function SourceAlerts({ list, stale, now }: SourceAlertsProps): JSX.Element | null {
  const { gateway, broker } = list;
  const troubles: Trouble[] = [];

  if (stale) troubles.push({ title: 'Lost contact with oh-my-usage', detail: 'Showing the last data it sent.' });

  if (!gateway.reachable) {
    const since = gateway.updatedAt
      ? `Usage was last read ${formatAge(gateway.updatedAt, now)} ago.`
      : 'No usage has been read yet.';
    troubles.push({
      title: 'The gateway cannot be reached',
      detail: gateway.error ? `${gateway.error}. ${since}` : since,
    });
  }

  if (broker && !broker.reachable) {
    troubles.push({
      title: 'The broker cannot be reached',
      detail: `${broker.error ? `${broker.error}. ` : ''}Pause states may be out of date.`,
    });
  }

  if (troubles.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {troubles.map(trouble => (
        <Notice key={trouble.title} title={trouble.title}>
          {trouble.detail}
        </Notice>
      ))}
    </div>
  );
}
