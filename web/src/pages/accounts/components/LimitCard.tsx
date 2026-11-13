import type { JSX } from 'react';
import clsx from 'clsx';
import { limitSeverity, shortLimitLabel, type LimitSeverity } from '@/lib/accounts';
import { forecast, type Forecast } from '@/lib/forecast';
import { formatPace, formatPercent, formatShort } from '@/lib/format';
import { providerTone } from '@/lib/providerTones';
import type { LimitCardProps } from './LimitCard.types';

const figureClasses: Record<LimitSeverity, string> = {
  normal: 'text-foreground',
  warn: 'text-warn',
  danger: 'text-danger',
};

// A mark and a word go with the colour, so the state never rests on colour alone.
const severityMarks: Record<LimitSeverity, { mark: string; word: string } | undefined> = {
  normal: undefined,
  warn: { mark: '▲', word: 'used, near its limit' },
  danger: { mark: '■', word: 'used, spent' },
};

/** Where the window is heading, in a sentence; `alarming` when it runs out before it resets. */
function outlook(
  view: Forecast,
  used: number,
  resetsAt: number | undefined,
  now: number
): { text: string; alarming: boolean } {
  if (used >= 1) return { text: 'Spent. Nothing more until it resets.', alarming: false };
  if (view.pace === undefined) return { text: 'Not enough history yet to say where it is heading.', alarming: false };

  if (view.spentAt !== undefined) {
    const early = resetsAt === undefined ? '' : `, ${formatShort(resetsAt - view.spentAt)} before it resets`;
    return { text: `At this pace it runs out in ${formatShort(view.spentAt - now)}${early}.`, alarming: true };
  }

  if (view.endsAt !== undefined) {
    return { text: `At this pace it ends the window at ${formatPercent(view.endsAt)}.`, alarming: false };
  }

  return { text: 'It has no reset time, so there is no telling where it ends.', alarming: false };
}

/**
 * One usage window in full: how much is used and when it resets, a gauge
 * with a tick where an even pace would be by now, how fast it is filling,
 * and whether at that pace it runs out before it resets.
 */
export function LimitCard({ limit, provider, samples, now }: LimitCardProps): JSX.Element {
  const used = limit.usedFraction;
  const severity = limitSeverity(limit);
  const marked = severityMarks[severity];
  const tone = providerTone(provider);
  const resetsAt = limit.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt);
  const view = forecast(limit, samples, now);
  const heading = used === undefined ? undefined : outlook(view, used, resetsAt, now);

  return (
    <article
      aria-label={limit.label}
      data-severity={severity}
      className="flex min-w-72 flex-1 flex-col gap-2 rounded-md border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-baseline gap-2">
        <span className="truncate text-body font-semibold tracking-caps uppercase">{shortLimitLabel(limit)}</span>
        {view.elapsed !== undefined && (
          <span className="ml-auto shrink-0 text-caption text-muted tabular-nums">
            {formatPercent(view.elapsed)} of the window gone
          </span>
        )}
      </div>

      {used === undefined ? (
        <p className="text-caption text-muted">The provider reports no amount for this window.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className={clsx('text-display font-semibold tabular-nums', figureClasses[severity])}>
              {marked && (
                <span aria-hidden="true" className="mr-1 text-body">
                  {marked.mark}
                </span>
              )}
              {formatPercent(used)}
            </span>
            <span className={clsx('text-caption', severity === 'normal' ? 'text-muted' : figureClasses[severity])}>
              {marked?.word ?? 'used'}
            </span>
            {resetsAt !== undefined && (
              <span className="ml-auto shrink-0 text-caption whitespace-nowrap text-muted tabular-nums">
                resets in{' '}
                <span className="text-heading font-semibold text-foreground">{formatShort(resetsAt - now)}</span>
              </span>
            )}
          </div>

          {/* What is used, in the provider's colour; the tick is where an even pace would be by now. */}
          <div className="h-2.5">
            <svg aria-hidden="true" viewBox="0 0 100 5" preserveAspectRatio="none" className="block size-full">
              <rect y="1" width="100" height="3" className={tone.track} />
              <rect y="1" width={Math.min(1, used) * 100} height="3" className={tone.fill} />
              {/* A line, not a box: the drawing stretches with the card and a line keeps its width. */}
              {view.elapsed !== undefined && (
                <line
                  data-testid="even-pace"
                  x1={view.elapsed * 100}
                  x2={view.elapsed * 100}
                  y1="0"
                  y2="5"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-foreground"
                />
              )}
            </svg>
          </div>

          {heading && (
            <p className={clsx('text-caption', heading.alarming ? 'text-warn' : 'text-foreground')}>
              {heading.alarming && (
                <span aria-hidden="true" className="mr-1">
                  ▲
                </span>
              )}
              {heading.text}
            </p>
          )}

          {/* A spent window is not filling: its pace would only be noise. */}
          {view.pace && used < 1 && (
            <p className="text-micro text-muted">
              {formatPace(view.pace.perHour)}
              {view.pace.basis === 'recent' && view.pace.overMs !== undefined
                ? ` over the last ${formatShort(view.pace.overMs)}`
                : ', the average since the window opened'}
            </p>
          )}
        </>
      )}
    </article>
  );
}
