import type { JSX } from 'react';
import clsx from 'clsx';
import { providerName, type LimitSeverity } from '@/lib/accounts';
import { formatPercent, formatShort } from '@/lib/format';
import type { PoolTileProps } from './PoolTile.types';
import { ProviderIcon } from './ProviderIcon';

const figureClasses: Record<LimitSeverity, string> = {
  normal: 'text-foreground',
  warn: 'text-warn',
  danger: 'text-danger',
};

const fillClasses: Record<LimitSeverity, string> = {
  normal: 'fill-meter',
  warn: 'fill-warn',
  danger: 'fill-danger',
};

const trackClasses: Record<LimitSeverity, string> = {
  normal: 'fill-meter-track',
  warn: 'fill-warn-track',
  danger: 'fill-danger-track',
};

// A word goes with the colour, so the state never rests on colour alone.
const severityWords: Record<LimitSeverity, string> = {
  normal: 'left',
  warn: 'left, low',
  danger: 'left, spent',
};

/**
 * What the page opens on: how much of one usage window is left across all of
 * a provider's accounts, and how long until it resets.
 */
export function PoolTile({ pool, now }: PoolTileProps): JSX.Element {
  const { severity } = pool;
  const reset = pool.nextReset ? formatShort(Date.parse(pool.nextReset) - now) : undefined;

  return (
    <article
      aria-label={`${providerName(pool.provider)} ${pool.label}`}
      data-severity={severity}
      className="flex min-w-72 flex-1 flex-col gap-1.5 rounded-md border border-border bg-surface px-3 pt-1.5 pb-2"
    >
      <div className="flex items-baseline gap-2">
        <span className="flex min-w-0 items-center gap-1.5 self-center text-micro text-muted">
          <ProviderIcon provider={pool.provider} decorative />
          <span className="truncate font-semibold tracking-caps text-foreground uppercase">
            {providerName(pool.provider)}
          </span>
          <span className="hidden truncate sm:inline">
            {pool.label}
            {pool.seats > 1 && ` · ${pool.seats} seats`}
          </span>
        </span>
        <span className={clsx('ml-auto text-heading font-semibold tabular-nums', figureClasses[severity])}>
          {formatPercent(pool.leftFraction)}
        </span>
        <span className={clsx('text-micro', severity === 'normal' ? 'text-muted' : figureClasses[severity])}>
          {severityWords[severity]}
        </span>
        {reset && (
          <span className="shrink-0 text-micro whitespace-nowrap text-muted tabular-nums">
            {pool.staggered ? 'next reset ' : 'resets in '}
            <span className="text-body font-semibold text-foreground">{reset}</span>
          </span>
        )}
      </div>

      {/* A fuel gauge: the filled part is what is left. */}
      <div className="h-1 overflow-hidden rounded-sm">
        <svg aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none" className="block size-full">
          <rect width="100" height="1" className={trackClasses[severity]} />
          <rect width={pool.leftFraction * 100} height="1" className={fillClasses[severity]} />
        </svg>
      </div>
    </article>
  );
}
