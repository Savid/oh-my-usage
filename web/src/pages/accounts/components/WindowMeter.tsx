import type { JSX } from 'react';
import clsx from 'clsx';
import { limitSeverity, shortLimitLabel, type LimitSeverity } from '@/lib/accounts';
import { forecast, type Forecast } from '@/lib/forecast';
import { formatPace, formatPercent, formatShort } from '@/lib/format';
import { providerTone } from '@/lib/providerTones';
import type { WindowMeterProps } from './WindowMeter.types';

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

/** Where the window is heading: a few words for the line, the whole sentence for hover and a screen reader. */
interface Outlook {
  short: string;
  full: string;
  /** It runs out before it resets. */
  alarming: boolean;
}

function outlook(view: Forecast, used: number, resetsAt: number | undefined, now: number): Outlook {
  if (used >= 1) {
    return { short: 'Spent until it resets', full: 'Spent. Nothing more until it resets.', alarming: false };
  }
  if (view.pace === undefined) {
    return {
      short: 'No pace yet',
      full: 'Not enough history yet to say where it is heading.',
      alarming: false,
    };
  }

  if (view.spentAt !== undefined) {
    const early = resetsAt === undefined ? '' : `, ${formatShort(resetsAt - view.spentAt)} before it resets`;
    return {
      short: `Out in ${formatShort(view.spentAt - now)}${early}`,
      full: `At this pace it runs out in ${formatShort(view.spentAt - now)}${early}.`,
      alarming: true,
    };
  }

  if (view.endsAt !== undefined) {
    return {
      short: `Ends the window near ${formatPercent(view.endsAt)}`,
      full: `At this pace it ends the window at ${formatPercent(view.endsAt)}.`,
      alarming: false,
    };
  }

  return {
    short: 'No reset time to judge by',
    full: 'It has no reset time, so there is no telling where it ends.',
    alarming: false,
  };
}

/** How fast it is filling: the rate for the line, and what it was read from in full. */
function paceOf(view: Forecast): { short: string; full: string } | undefined {
  if (!view.pace) return undefined;
  const rate = formatPace(view.pace.perHour);
  return {
    short: rate,
    full:
      view.pace.basis === 'recent' && view.pace.overMs !== undefined
        ? `${rate} over the last ${formatShort(view.pace.overMs)}`
        : `${rate}, the average since the window opened`,
  };
}

/**
 * One usage window on a line, as the homepage's totals are: its name, a meter
 * in the provider's colour with a tick where an even pace would be by now,
 * the share used and when it resets. Under it, in a few words, where it is
 * heading and how fast it is filling, in the warning colour when it runs out
 * before it resets; the whole sentence on hover.
 */
export function WindowMeter({ limit, provider, samples, now }: WindowMeterProps): JSX.Element {
  const used = limit.usedFraction;
  const severity = limitSeverity(limit);
  const marked = severityMarks[severity];
  const tone = providerTone(provider);
  const resetsAt = limit.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt);
  const view = forecast(limit, samples, now);
  const heading = used === undefined ? undefined : outlook(view, used, resetsAt, now);
  // A spent window is not filling: its pace would only be noise.
  const pace = used !== undefined && used < 1 ? paceOf(view) : undefined;
  const gone = view.elapsed === undefined ? undefined : `${formatPercent(view.elapsed)} of the window gone`;

  return (
    <li aria-label={limit.label} data-severity={severity} className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-24 shrink-0 truncate text-caption font-semibold tracking-caps uppercase sm:w-28">
          {shortLimitLabel(limit)}
        </span>

        {used === undefined ? (
          <span className="min-w-0 flex-1 text-caption text-muted">
            The provider reports no amount for this window.
          </span>
        ) : (
          <>
            {/* What is used, in the provider's colour; the tick is where an even pace would be by now. */}
            <div title={gone} className="h-2.5 min-w-8 flex-1">
              <svg aria-hidden="true" viewBox="0 0 100 10" preserveAspectRatio="none" className="block size-full">
                <rect y="2.5" width="100" height="5" className={tone.track} />
                <rect y="2.5" width={Math.min(1, used) * 100} height="5" className={tone.fill} />
                {/* A line, not a box: the drawing stretches with the meter and a line keeps its width. */}
                {view.elapsed !== undefined && (
                  <line
                    data-testid="even-pace"
                    x1={view.elapsed * 100}
                    x2={view.elapsed * 100}
                    y1="0"
                    y2="10"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-foreground"
                  />
                )}
              </svg>
            </div>
            <span
              className={clsx(
                'flex w-14 shrink-0 items-baseline justify-end gap-1 text-title font-semibold tabular-nums',
                figureClasses[severity]
              )}
            >
              {marked && (
                <span aria-hidden="true" className="text-caption">
                  {marked.mark}
                </span>
              )}
              {formatPercent(used)}
              <span className="sr-only">
                {' '}
                {marked?.word ?? 'used'}
                {gone && `, ${gone}`}
              </span>
            </span>
          </>
        )}

        <span className="w-16 shrink-0 text-right text-micro whitespace-nowrap text-muted tabular-nums sm:w-20">
          {resetsAt !== undefined && (
            <>
              in <span className="text-caption font-semibold text-foreground">{formatShort(resetsAt - now)}</span>
              <span className="sr-only"> until it resets</span>
            </>
          )}
        </span>
      </div>

      {heading && (
        <p
          title={`${heading.full}${pace ? ` ${pace.full}.` : ''}`}
          className={clsx(
            'pl-27 text-micro sm:pl-31',
            heading.alarming ? 'text-warn' : used !== undefined && used >= 1 ? 'text-danger' : 'text-muted'
          )}
        >
          <span aria-hidden="true">
            {heading.alarming && '▲ '}
            {heading.short}
            {pace && <span className="text-muted"> · {pace.short}</span>}
          </span>
          <span className="sr-only">
            {heading.full}
            {pace && ` ${pace.full}.`}
          </span>
        </p>
      )}
    </li>
  );
}
