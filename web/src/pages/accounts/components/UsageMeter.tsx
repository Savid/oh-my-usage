import type { JSX } from 'react';
import type { Limit } from '@/api';
import { limitSeverity, type LimitSeverity } from '@/lib/accounts';
import { formatPercent, formatUntil } from '@/lib/format';
import type { UsageMeterProps } from './UsageMeter.types';

// The fill carries the severity; the track is a lighter step of the same
// colour, so the state reads across the whole bar.
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
const severityWords: Record<LimitSeverity, string | undefined> = {
  normal: undefined,
  warn: 'Near its limit',
  danger: 'Used up',
};

/** What sits under the bar: the state in a word, and when the window resets. */
function caption(limit: Limit, severity: LimitSeverity, now: number): string | undefined {
  const parts: string[] = [];
  const word = severityWords[severity];
  if (word) parts.push(word);
  if (limit.resetsAt) parts.push(`${word ? 'resets' : 'Resets'} in ${formatUntil(limit.resetsAt, now)}`);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** One usage window as a meter: its name, how much is used, and when it resets. */
export function UsageMeter({ limit, now }: UsageMeterProps): JSX.Element {
  const used = limit.usedFraction;

  if (used === undefined) {
    return (
      <div className="flex items-baseline justify-between gap-4 text-body">
        <span>{limit.label}</span>
        <span className="text-muted">not reported</span>
      </div>
    );
  }

  const severity = limitSeverity(limit);
  const percent = Math.round(used * 100);
  const note = caption(limit, severity, now);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-4 text-body">
        <span>{limit.label}</span>
        <span className="font-mono">{formatPercent(used)}</span>
      </div>
      <div
        role="meter"
        aria-label={limit.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
        aria-valuetext={`${formatPercent(used)} used`}
        data-severity={severity}
        className="h-2 overflow-hidden rounded-sm"
      >
        {/* Stretched to the bar's box: widths are percentages of it. */}
        <svg aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none" className="block size-full">
          <rect width="100" height="1" className={trackClasses[severity]} />
          <rect width={Math.min(100, Math.max(0, used * 100))} height="1" className={fillClasses[severity]} />
        </svg>
      </div>
      {note && <p className="text-caption text-muted">{note}</p>}
    </div>
  );
}
