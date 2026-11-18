import { useId, type JSX } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { Account, AccountList, Limit, TrendPoint } from '@/api';
import { listAccountsQueryKey, setAccountPausedMutation } from '@/api/@tanstack/react-query.gen';
import { StatusBadge } from '@/components/Feedback/StatusBadge';
import type { StatusTone } from '@/components/Feedback/StatusBadge/StatusBadge.types';
import { ProviderIcon } from '@/components/Data/ProviderIcon';
import {
  accountTitle,
  limitSeverity,
  limitTag,
  primaryLimit,
  shortLimitLabel,
  type LimitSeverity,
} from '@/lib/accounts';
import { viewAccount, type LimitView } from '@/lib/fleet';
import { formatPace, formatPercent, formatPrice, formatShort } from '@/lib/format';
import { problemDetail } from '@/lib/problem';
import { providerTone, type ProviderTone } from '@/lib/providerTones';
import { sparkPaths, type SparkPaths, type SparkPoint } from '@/lib/sparkline';
import type { AccountRowProps } from './AccountRow.types';

/** Usage older than this is called out: the provider has not answered for a while. */
const STALE_MS = 15 * 60_000;

// The chart's own units; it stretches to the whole row.
const WIDTH = 100;
const HEIGHT = 40;

const figureClasses: Record<LimitSeverity, string> = {
  normal: 'text-foreground',
  warn: 'text-warn',
  danger: 'text-danger',
};

// A mark and a word go with the colour, so the state never rests on colour alone.
const severityMarks: Record<LimitSeverity, { mark: string; word: string } | undefined> = {
  normal: undefined,
  warn: { mark: '▲', word: ', near its limit' },
  danger: { mark: '■', word: ', spent' },
};

/** The account's state in a word: paused wins, then omp's own block. */
function state(account: Account, now: number): { tone: StatusTone; label: string } {
  if (account.paused) return { tone: 'warn', label: 'paused' };
  if (account.blockedUntil && Date.parse(account.blockedUntil) > now) {
    return { tone: 'danger', label: `blocked ${formatShort(Date.parse(account.blockedUntil) - now)}` };
  }
  return { tone: 'ok', label: 'active' };
}

/** What follows the name: organisation, plan, price, saved resets, and how old the usage is when it is old. */
function about(account: Account, now: number): string {
  const parts: string[] = [];
  // A personal organisation is named after its owner's email, which the row already shows.
  if (account.orgName && !(account.email && account.orgName.startsWith(account.email))) parts.push(account.orgName);
  // A plan named after the provider says nothing the name does not.
  if (account.plan && !accountTitle(account).includes(account.plan)) parts.push(account.plan);
  if (account.kind === 'api_key' && account.email) parts.push('API key');
  if (account.monthlyUsd !== undefined) parts.push(`${formatPrice(account.monthlyUsd)}/mo`);

  const resets = account.resets;
  if (resets && resets.available > 0) {
    const usable = resets.usable === undefined ? '' : `, ${resets.usable} usable`;
    parts.push(`${resets.available} ${resets.available === 1 ? 'reset' : 'resets'}${usable}`);
  }

  if (account.fetchedAt && now - Date.parse(account.fetchedAt) > STALE_MS) {
    parts.push(`usage ${formatShort(now - Date.parse(account.fetchedAt))} old`);
  }

  return parts.join(' · ');
}

/**
 * The row's chart: how much of its main window the account had used over time.
 * With recorded usage it is a glow under a line, ending at the current value;
 * without, a level glow at the current value, which claims a level and no
 * history.
 */
function chart(
  points: readonly TrendPoint[],
  used: number,
  start: number,
  now: number
): SparkPaths & { level: boolean } {
  const recorded: SparkPoint[] = points
    .map(point => ({ time: Date.parse(point.at), value: point.usedFraction }))
    .filter(point => point.time >= start && point.time <= now);

  // The chart spans the row, so it begins where this account's history does:
  // one recorded for less than the period would otherwise leave a gap.
  const from = Math.max(start, recorded[0]?.time ?? start);
  const drawn = sparkPaths([...recorded, { time: now, value: used }], from, now, WIDTH, HEIGHT);
  if (recorded.length > 0 && drawn) return { ...drawn, level: false };

  const flat = sparkPaths(
    [
      { time: 0, value: used },
      { time: 1, value: used },
    ],
    0,
    1,
    WIDTH,
    HEIGHT
  );
  return { line: '', area: flat?.area ?? '', end: flat?.end ?? { x: WIDTH, y: HEIGHT }, level: true };
}

function resetIn(limit: Limit, now: number): string | undefined {
  return limit.resetsAt ? formatShort(Date.parse(limit.resetsAt) - now) : undefined;
}

/**
 * Another of the account's windows as a small ring, read like a watch's: the
 * outer arc is how much of it is used, in the provider's colour; the inner,
 * how much of its time has passed. An outer arc running ahead of the inner
 * one is a window filling faster than it resets. Its share sits inside and a
 * short tag under it; a mark at its shoulder calls out trouble. On a narrow
 * screen the ring shrinks to a glyph on a line, with its tag, share and reset
 * beside it. Assistive technology hears it as a sentence.
 */
function WindowRing({ entry, tone, now }: { entry: LimitView; tone: ProviderTone; now: number }): JSX.Element {
  const { limit, forecast: ahead } = entry;
  const share = limit.usedFraction;
  const severity = limitSeverity(limit);
  const dry = entry.verdict === 'dry';
  const marked = severityMarks[severity];
  const mark = dry ? '▲' : marked?.mark;
  const reset = resetIn(limit, now);
  const elapsed = ahead.elapsed;

  const name = shortLimitLabel(limit);
  const said =
    share === undefined
      ? `${name}: not reported`
      : `${name}: ${formatPercent(share)} used${marked?.word ?? ''}${dry ? ', runs dry before it resets' : ''}${reset ? `, resets in ${reset}` : ''}`;

  return (
    <li
      title={elapsed === undefined ? said : `${said}; ${formatPercent(elapsed)} of its time gone`}
      className="relative flex items-center gap-1.5 text-micro whitespace-nowrap lg:w-16 lg:flex-col lg:gap-0"
    >
      <span className="sr-only">{said}</span>
      <svg aria-hidden="true" viewBox="0 0 40 40" className="size-5 shrink-0 lg:size-10">
        <g transform="rotate(-90 20 20)" fill="none" strokeLinecap="round">
          {/* The track takes the provider's paler step as its text colour. */}
          <circle cx="20" cy="20" r="17" strokeWidth="3" stroke="currentColor" className={tone.glow} />
          {share !== undefined && share > 0 && (
            <circle
              cx="20"
              cy="20"
              r="17"
              strokeWidth="3"
              pathLength={100}
              strokeDasharray={`${Math.min(1, share) * 100} 100`}
              className={tone.line}
            />
          )}
          {elapsed !== undefined && (
            <>
              <circle cx="20" cy="20" r="13" strokeWidth="1.5" className="stroke-border" />
              {elapsed > 0 && (
                <circle
                  cx="20"
                  cy="20"
                  r="13"
                  strokeWidth="1.5"
                  pathLength={100}
                  strokeDasharray={`${elapsed * 100} 100`}
                  className="stroke-muted"
                />
              )}
            </>
          )}
        </g>
      </svg>
      <span aria-hidden="true" className="tracking-caps text-muted uppercase lg:max-w-full lg:truncate">
        {limitTag(limit)}
      </span>
      {mark && (
        <span
          aria-hidden="true"
          className={clsx('lg:absolute lg:top-0 lg:right-1', dry ? 'text-danger' : figureClasses[severity])}
        >
          {mark}
        </span>
      )}
      <span
        aria-hidden="true"
        className={clsx(
          'font-semibold tabular-nums lg:absolute lg:inset-x-0 lg:top-0 lg:flex lg:h-10 lg:items-center lg:justify-center',
          share === undefined ? 'text-muted' : figureClasses[severity]
        )}
      >
        {share === undefined ? '–' : formatPercent(share)}
      </span>
      {reset && (
        <span aria-hidden="true" className="text-muted tabular-nums lg:hidden">
          in {reset}
        </span>
      )}
    </li>
  );
}

/**
 * Pauses the account or resumes it: a small round button over the end of the
 * chart. With a mouse it shows when the row is pointed at, so the chart runs
 * clear; a paused account keeps it, lit, as a way back. It shows the change
 * it makes: two bars to pause, a triangle to resume.
 */
function PauseButton({
  paused,
  pending,
  onToggle,
}: {
  paused: boolean;
  pending: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={paused ? 'Resume' : 'Pause'}
      title={paused ? 'Resume: let omp send it traffic' : "Pause: move omp's traffic off it"}
      disabled={pending}
      onClick={onToggle}
      className={clsx(
        'grid size-7 place-items-center rounded-full border bg-surface transition duration-150 disabled:cursor-wait motion-reduce:transition-none',
        paused
          ? 'border-warn text-warn hover:bg-raised'
          : 'border-border text-muted hover:border-border-strong hover:text-foreground focus-visible:scale-100 focus-visible:opacity-100 pointer-fine:scale-75 pointer-fine:opacity-0 pointer-fine:group-hover:scale-100 pointer-fine:group-hover:opacity-100'
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 fill-current">
        {paused ? (
          <path d="M3.5 1.75v8.5L10.5 6z" />
        ) : (
          <>
            <rect x="2.5" y="1.5" width="2.5" height="9" rx="0.75" />
            <rect x="7" y="1.5" width="2.5" height="9" rx="0.75" />
          </>
        )}
      </svg>
    </button>
  );
}

/**
 * One account as a band across the page, in three parts that never overlap.
 * On solid ground at the left: the big figure for its main usage window (the
 * one that resets last), who it is, when that window resets, and its other
 * windows as short lines. In the open middle (behind it all, on a narrow
 * screen): a chart of what it had used, in its provider's colour, running to
 * the row's end at now. Over that
 * end, with a broker: a small button to pause or resume it. Trouble ahead (a window that runs dry
 * before it resets at its pace) is the only forecast it shows, and its state
 * shows only when it is not taking work.
 */
export function AccountRow({ account, trends, start, now, controls, headingLevel = 3 }: AccountRowProps): JSX.Element {
  const queryClient = useQueryClient();
  const glowId = useId();
  const pause = useMutation({
    ...setAccountPausedMutation(),
    // The answer is the account as the broker now reports it; the event
    // stream sends the same after its next poll.
    onSuccess: updated => {
      queryClient.setQueryData(listAccountsQueryKey(), (list: AccountList | undefined) =>
        list ? { ...list, accounts: list.accounts.map(entry => (entry.id === updated.id ? updated : entry)) } : list
      );
    },
  });

  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const headingId = `account-${account.id}`;
  // The button shows the change as soon as it is pressed, and back if the broker refuses.
  const paused = pause.isPending ? pause.variables.body.paused : account.paused;
  const { tone: stateTone, label } = state({ ...account, paused }, now);
  // The chart wears the provider's colour; the figure carries the state.
  const tone = providerTone(account.provider);
  const meta = about(account, now);

  const primary = primaryLimit(account.limits);
  const used = primary?.usedFraction;
  const severity = primary ? limitSeverity(primary) : 'normal';
  const marked = severityMarks[severity];
  const reset = primary ? resetIn(primary, now) : undefined;
  const pausable = controls && account.pausable;
  // Where each window is heading at its pace: only trouble is called out.
  const view = viewAccount(account, trends, now);
  const others = view.limits.filter(entry => entry.limit !== primary);
  const mainDryAt = primary ? view.limits.find(entry => entry.limit === primary)?.forecast.spentAt : undefined;
  const drawn =
    primary && used !== undefined
      ? chart(
          trends.find(trend => trend.accountId === account.id && trend.limitId === primary.id)?.points ?? [],
          used,
          start,
          now
        )
      : undefined;

  return (
    <article
      aria-labelledby={headingId}
      data-severity={severity}
      data-chart={drawn ? (drawn.level ? 'level' : 'history') : 'none'}
      className="group relative overflow-hidden"
    >
      {drawn && (
        <>
          {/* A glow under a line, deepest under the line and fading towards the foot of
              the row. Its stops take the text colour, which is how a gradient wears a token.
              On a wide screen it starts where the words end and runs to the row's end; on a
              narrow one it runs behind the whole row, the words over it. */}
          <div data-testid="history" aria-hidden="true" className="absolute inset-y-0 right-3 left-0 lg:left-174">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio="none"
              className="block size-full overflow-visible"
            >
              <defs>
                <linearGradient id={glowId} x1="0" y1="0" x2="0" y2="1" className={tone.glow}>
                  <stop offset="0" stopColor="currentColor" />
                  <stop offset="1" stopColor="currentColor" stopOpacity="0.2" />
                </linearGradient>
              </defs>
              <path d={drawn.area} fill={`url(#${glowId})`} />
              {drawn.line && (
                <>
                  <path
                    d={drawn.line}
                    fill="none"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className={tone.line}
                  />
                  {/* Now: a line of no length with round ends, a dot the chart's stretch cannot squash. */}
                  <line
                    x1={drawn.end.x}
                    x2={drawn.end.x}
                    y1={drawn.end.y}
                    y2={drawn.end.y}
                    strokeWidth="5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className={tone.line}
                  />
                </>
              )}
            </svg>
          </div>
          {/* The chart fades in from the ground at its start. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-16 bg-linear-to-r from-surface to-transparent lg:left-174"
          />
        </>
      )}

      <div
        className={clsx(
          // On a narrow row the words sit over the chart, haloed in the ground so its line never strikes them.
          'relative flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 text-shadow-halo lg:items-center lg:gap-x-6',
          drawn ? 'min-h-20' : 'min-h-14'
        )}
      >
        {primary && used !== undefined ? (
          <p className="w-24 shrink-0 lg:text-right">
            <span className={clsx('block text-display font-semibold tabular-nums', figureClasses[severity])}>
              {marked && (
                <span aria-hidden="true" className="mr-1 text-body">
                  {marked.mark}
                </span>
              )}
              {formatPercent(used)}
            </span>
            <span
              className={clsx(
                'block text-micro tracking-caps uppercase',
                severity === 'normal' ? 'text-muted' : figureClasses[severity]
              )}
            >
              used{marked && <span className="sr-only">{marked.word}</span>}
            </span>
          </p>
        ) : (
          <p className="w-24 shrink-0 text-micro text-muted lg:text-right">no usage reported</p>
        )}

        <div className="flex min-w-0 flex-1 flex-col lg:w-96 lg:flex-none">
          {/* On a narrow row the button sits at the end of this line, so only the name gives way to it. */}
          <div className={clsx('flex items-center gap-2 text-muted', pausable && 'pr-8 lg:pr-0')}>
            <ProviderIcon provider={account.provider} size="md" />
            <Heading id={headingId} className="min-w-0 truncate text-title font-semibold text-foreground">
              <Link
                to="/accounts/$accountId"
                params={{ accountId: account.id }}
                className="underline-offset-4 hover:underline"
              >
                {accountTitle(account)}
              </Link>
            </Heading>
            {/* Taking work is the normal state and says nothing; anything else is named. */}
            {stateTone !== 'ok' && (
              <span className="shrink-0">
                <StatusBadge tone={stateTone}>{label}</StatusBadge>
              </span>
            )}
          </div>
          {primary && (
            <p className="truncate text-caption text-muted">
              {shortLimitLabel(primary)}
              {reset && (
                <>
                  {' · resets in '}
                  <span className="font-semibold text-foreground tabular-nums">{reset}</span>
                </>
              )}
              {mainDryAt !== undefined ? (
                <span className="text-danger">
                  {' · '}
                  <span aria-hidden="true">▲ </span>runs dry in{' '}
                  <span className="font-semibold tabular-nums">{formatShort(mainDryAt - now)}</span>
                </span>
              ) : view.idle === true ? (
                ' · idle'
              ) : (
                view.burn !== undefined &&
                view.burn > 0 && <span className="tabular-nums"> · +{formatPace(view.burn)}</span>
              )}
            </p>
          )}
          {meta && <p className="truncate text-micro text-muted">{meta}</p>}
        </div>

        {/* A line of their own under a narrow row; rings side by side beside the name on a wide one. */}
        {others.length > 0 && (
          <ul
            aria-label="Other windows"
            className="order-last flex basis-full flex-wrap gap-x-4 gap-y-1 lg:order-0 lg:w-34 lg:basis-auto lg:gap-2"
          >
            {others.map(entry => (
              <WindowRing key={entry.limit.id} entry={entry} tone={tone} now={now} />
            ))}
          </ul>
        )}

        {pausable && (
          <div className="absolute top-2.5 right-3 flex lg:static lg:ml-auto">
            <PauseButton
              paused={paused}
              pending={pause.isPending}
              onToggle={() => pause.mutate({ path: { accountId: account.id }, body: { paused: !paused } })}
            />
          </div>
        )}

        {pause.isError && (
          // A line of its own under the row, on solid ground.
          <p role="alert" className="order-last basis-full text-caption text-danger lg:text-right">
            <span className="rounded-sm bg-surface px-1">
              {account.paused ? 'Could not resume the account' : 'Could not pause the account'}:{' '}
              {problemDetail(pause.error, 'the server did not answer')}
            </span>
          </p>
        )}
      </div>
    </article>
  );
}
