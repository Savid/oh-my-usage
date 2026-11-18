import type { JSX } from 'react';
import clsx from 'clsx';
import { ProviderIcon } from '@/components/Data/ProviderIcon';
import { providerName, type LimitSeverity } from '@/lib/accounts';
import { formatPercent, formatShort } from '@/lib/format';
import { providerTone } from '@/lib/providerTones';
import type { PoolMeterProps } from './PoolMeter.types';

const figureClasses: Record<LimitSeverity, string> = {
  normal: 'text-foreground',
  warn: 'text-warn',
  danger: 'text-danger',
};

// A mark and a word go with the colour, so the state never rests on colour alone.
const severityMarks: Record<LimitSeverity, string | undefined> = { normal: undefined, warn: '▲', danger: '■' };
const severityWords: Record<LimitSeverity, string> = {
  normal: 'used',
  warn: 'used, near limit',
  danger: 'used, spent',
};

/**
 * One line of the totals: how much of a provider's main window is used across
 * all its accounts, as a figure and a meter in its colour, and how long until
 * it resets. Lines stack so their figures fall in columns.
 */
export function PoolMeter({ pool, now }: PoolMeterProps): JSX.Element {
  const { severity } = pool;
  const tone = providerTone(pool.provider);
  const reset = pool.nextReset ? formatShort(Date.parse(pool.nextReset) - now) : undefined;
  const mark = severityMarks[severity];

  return (
    <li
      aria-label={`${providerName(pool.provider)} ${pool.label}`}
      data-severity={severity}
      className="flex min-w-0 items-center gap-2 sm:gap-3"
    >
      <div className="flex w-32 min-w-0 shrink-0 items-center gap-2 sm:w-40">
        <ProviderIcon provider={pool.provider} decorative size="md" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-caption font-semibold tracking-caps uppercase">
            {providerName(pool.provider)}
          </span>
          <span className="truncate text-micro text-muted">
            {pool.label}
            {pool.seats > 1 && ` · ${pool.seats} seats`}
          </span>
        </div>
      </div>

      {/* The filled part is what is used, in the provider's colour; the figure beside it carries the state. */}
      <div className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-sm">
        <svg aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none" className="block size-full">
          <rect width="100" height="1" className={tone.track} />
          <rect width={Math.min(1, pool.usedFraction) * 100} height="1" className={tone.fill} />
        </svg>
      </div>

      <span
        className={clsx(
          'flex w-14 shrink-0 items-baseline justify-end gap-1 text-title font-semibold tabular-nums sm:w-16',
          figureClasses[severity]
        )}
      >
        {mark && (
          <span aria-hidden="true" className="text-caption">
            {mark}
          </span>
        )}
        {formatPercent(pool.usedFraction)}
        <span className="sr-only">{severityWords[severity]}</span>
      </span>

      <span className="w-16 shrink-0 text-right text-micro whitespace-nowrap text-muted tabular-nums sm:w-20">
        {reset && (
          <>
            {pool.staggered ? 'next ' : 'in '}
            <span className="text-caption font-semibold text-foreground">{reset}</span>
          </>
        )}
      </span>
    </li>
  );
}
