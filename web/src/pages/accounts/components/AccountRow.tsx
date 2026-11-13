import { useId, type JSX } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { Account, AccountList, Limit, TrendPoint } from '@/api';
import { listAccountsQueryKey, setAccountPausedMutation } from '@/api/@tanstack/react-query.gen';
import { StatusBadge } from '@/components/Feedback/StatusBadge';
import type { StatusTone } from '@/components/Feedback/StatusBadge/StatusBadge.types';
import { ProviderIcon } from '@/components/Data/ProviderIcon';
import { accountTitle, limitSeverity, primaryLimit, shortLimitLabel, type LimitSeverity } from '@/lib/accounts';
import { formatPercent, formatShort } from '@/lib/format';
import { problemDetail } from '@/lib/problem';
import { providerTone } from '@/lib/providerTones';
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

/** What follows the name: organisation, plan, saved resets, and how old the usage is when it is old. */
function about(account: Account, now: number): string {
  const parts: string[] = [];
  // A personal organisation is named after its owner's email, which the row already shows.
  if (account.orgName && !(account.email && account.orgName.startsWith(account.email))) parts.push(account.orgName);
  // A plan named after the provider says nothing the name does not.
  if (account.plan && !accountTitle(account).includes(account.plan)) parts.push(account.plan);
  if (account.kind === 'api_key' && account.email) parts.push('API key');

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
  return { line: '', area: flat?.area ?? '', level: true };
}

function resetIn(limit: Limit, now: number): string | undefined {
  return limit.resetsAt ? formatShort(Date.parse(limit.resetsAt) - now) : undefined;
}

/**
 * One account as a band across the page, drawn over a chart of what it had
 * used, in its provider's colour. It leads with the big figure for its main usage window (the one that
 * resets last), then who it is and when that window resets. To the right, its
 * other windows as small values, whether it is taking traffic, and the pause
 * control when a broker is configured. Everything written sits on solid
 * ground: the chart fades in beside the name and runs behind the chips.
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
  const { tone: stateTone, label } = state(account, now);
  // The chart wears the provider's colour; the figure carries the state.
  const tone = providerTone(account.provider);
  const meta = about(account, now);

  const primary = primaryLimit(account.limits);
  const used = primary?.usedFraction;
  const severity = primary ? limitSeverity(primary) : 'normal';
  const marked = severityMarks[severity];
  const reset = primary ? resetIn(primary, now) : undefined;
  const others = account.limits.filter(limit => limit !== primary);
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
      className="relative overflow-hidden"
    >
      {drawn && (
        <>
          {/* A glow under a line, deepest under the line and fading towards the foot of
              the row. Its stops take the text colour, which is how a gradient wears a token. */}
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
          >
            <defs>
              <linearGradient id={glowId} x1="0" y1="0" x2="0" y2="1" className={tone.glow}>
                <stop offset="0" stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <path d={drawn.area} fill={`url(#${glowId})`} />
            {drawn.line && (
              <path
                d={drawn.line}
                fill="none"
                strokeWidth="1.5"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className={tone.line}
              />
            )}
          </svg>
          {/* Solid ground under the figure and the name; the chart shows through as it fades. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-full bg-linear-to-r from-surface via-surface via-85% to-transparent lg:w-176 lg:via-65%"
          />
        </>
      )}

      <div
        className={clsx(
          'relative flex flex-col justify-center gap-2 px-4 py-3 lg:flex-row lg:items-center lg:gap-6',
          drawn ? 'min-h-28' : 'min-h-14'
        )}
      >
        <div className="flex min-w-0 items-center gap-4 lg:flex-1">
          {primary && used !== undefined ? (
            <p className="w-24 shrink-0 text-right">
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
            <p className="w-24 shrink-0 text-right text-micro text-muted">no usage reported</p>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 text-muted">
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
              </p>
            )}
            {meta && <p className="truncate text-micro text-muted">{meta}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
          {/* Each small value sits on its own solid chip, so the chart never runs through it. */}
          <ul className="flex flex-wrap gap-1.5 text-micro text-muted">
            {others.map(limit => {
              const share = limit.usedFraction;
              const otherReset = resetIn(limit, now);
              return (
                <li
                  key={limit.id}
                  className="flex h-6 items-center gap-1.5 rounded-sm border border-border bg-surface px-2 whitespace-nowrap"
                >
                  <span className="tracking-caps uppercase">{shortLimitLabel(limit)}</span>{' '}
                  {share === undefined ? (
                    'not reported'
                  ) : (
                    <>
                      <span
                        className={clsx('text-caption font-semibold tabular-nums', figureClasses[limitSeverity(limit)])}
                      >
                        {formatPercent(share)}
                      </span>
                      {otherReset && <span className="tabular-nums"> · {otherReset}</span>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-2">
            <span className="flex h-6 items-center rounded-sm border border-border bg-surface px-2">
              <StatusBadge tone={stateTone}>{label}</StatusBadge>
            </span>
            {controls && account.pausable && (
              <button
                type="button"
                disabled={pause.isPending}
                onClick={() => pause.mutate({ path: { accountId: account.id }, body: { paused: !account.paused } })}
                className="h-6 w-16 rounded-sm border border-border-strong bg-surface text-micro tracking-caps uppercase hover:bg-raised disabled:text-muted"
              >
                {account.paused ? 'Resume' : 'Pause'}
              </button>
            )}
          </div>
        </div>

        {pause.isError && (
          <p role="alert" className="text-caption text-danger lg:absolute lg:right-4 lg:bottom-1">
            {account.paused ? 'Could not resume the account' : 'Could not pause the account'}:{' '}
            {problemDetail(pause.error, 'the server did not answer')}
          </p>
        )}
      </div>
    </article>
  );
}
