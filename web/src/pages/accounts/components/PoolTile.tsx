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
      className="flex min-w-72 flex-1 flex-col gap-2 rounded-md border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-center gap-2 text-muted">
        <ProviderIcon provider={pool.provider} decorative size="md" />
        <span className="truncate text-body font-semibold tracking-caps text-foreground uppercase">
          {providerName(pool.provider)}
        </span>
        <span className="ml-auto shrink-0 text-caption">
          {pool.label}
          {pool.seats > 1 && ` · ${pool.seats} seats`}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className={clsx('text-display font-semibold tabular-nums', figureClasses[severity])}>
          {formatPercent(pool.leftFraction)}
        </span>
        <span className={clsx('text-caption', severity === 'normal' ? 'text-muted' : figureClasses[severity])}>
          {severityWords[severity]}
        </span>
        {reset && (
          <span className="ml-auto shrink-0 text-caption whitespace-nowrap text-muted tabular-nums">
            {pool.staggered ? 'next reset ' : 'resets in '}
            <span className="text-heading font-semibold text-foreground">{reset}</span>
          </span>
        )}
      </div>

      {/* A fuel gauge: the filled part is what is left. */}
      <div className="h-1.5 overflow-hidden rounded-sm">
        <svg aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none" className="block size-full">
          <rect width="100" height="1" className={trackClasses[severity]} />
          <rect width={pool.leftFraction * 100} height="1" className={fillClasses[severity]} />
        </svg>
      </div>
    </article>
  );
}
