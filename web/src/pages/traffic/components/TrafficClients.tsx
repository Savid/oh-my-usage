import type { JSX } from 'react';
import { ProviderIcon } from '@/components/Data/ProviderIcon';
import { providerName } from '@/lib/accounts';
import { formatCount, formatUsd } from '@/lib/format';
import type { TrafficClientsProps } from './TrafficClients.types';

const numberColumns = ['Requests', 'Input', 'Output', 'Cache read', 'Cache write', 'API value'];

/**
 * Who sent the week's traffic and where it went: one line per client,
 * application and provider, with every kind of token and the cost at API
 * prices. It is also the figures behind the charts, in full.
 */
export function TrafficClients({ clients }: TrafficClientsProps): JSX.Element {
  if (clients.length === 0) {
    return <p className="text-caption text-muted">No client has sent anything in the last 7 days.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-caption">
        <thead>
          <tr className="border-b border-border text-micro tracking-caps text-muted uppercase">
            <th scope="col" className="py-1 pr-4 font-semibold">
              Client
            </th>
            <th scope="col" className="py-1 pr-4 font-semibold">
              App
            </th>
            <th scope="col" className="py-1 pr-4 font-semibold">
              Provider
            </th>
            {numberColumns.map(column => (
              <th key={column} scope="col" className="py-1 pl-4 text-right font-semibold whitespace-nowrap">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clients.map(client => (
            <tr key={`${client.installId} ${client.app} ${client.provider}`} className="border-b border-border">
              <th scope="row" title={client.installId} className="py-1 pr-4 font-medium whitespace-nowrap">
                {client.hostname || client.installId}
              </th>
              <td className="py-1 pr-4 whitespace-nowrap text-muted">{client.app || 'unnamed'}</td>
              <td className="py-1 pr-4 whitespace-nowrap">
                <span className="flex items-center gap-2">
                  <ProviderIcon provider={client.provider} decorative />
                  {providerName(client.provider)}
                </span>
              </td>
              <td className="py-1 pl-4 text-right tabular-nums">{formatCount(client.counts.requests)}</td>
              <td className="py-1 pl-4 text-right tabular-nums">{formatCount(client.counts.inputTokens)}</td>
              <td className="py-1 pl-4 text-right tabular-nums">{formatCount(client.counts.outputTokens)}</td>
              <td className="py-1 pl-4 text-right tabular-nums">{formatCount(client.counts.cacheReadTokens)}</td>
              <td className="py-1 pl-4 text-right tabular-nums">{formatCount(client.counts.cacheWriteTokens)}</td>
              <td className="py-1 pl-4 text-right font-semibold tabular-nums">{formatUsd(client.counts.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
