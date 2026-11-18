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
import { viewAccount } from '@/lib/fleet';
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
 * Another of the account's windows on one short line: its name, how much of
 * it is used, a bar of that in the provider's colour, and when it resets.
 * Beside the name on a wide screen the lines stack, so their parts fall in
 * columns.
 */
function WindowLine({
  limit,
  tone,
  dry,
  now,
}: {
  limit: Limit;
  tone: ProviderTone;
  dry: boolean;
  now: number;
}): JSX.Element {
  const share = limit.usedFraction;
  const severity = limitSeverity(limit);
  const marked = severityMarks[severity];
  const reset = resetIn(limit, now);

  return (
    <li className="flex items-center gap-2 text-micro whitespace-nowrap">
      <span className="tracking-caps text-muted uppercase lg:w-24 lg:truncate">{shortLimitLabel(limit)}</span>
      {share === undefined ? (
        <span className="text-muted">not reported</span>
      ) : (
        <>
          <span
            className={clsx('text-caption font-semibold tabular-nums lg:w-12 lg:text-right', figureClasses[severity])}
          >
            {dry ? (
              <span className="text-danger">
                <span aria-hidden="true">▲ </span>
                <span className="sr-only">runs dry before it resets, </span>
              </span>
            ) : (
              marked && <span aria-hidden="true">{marked.mark} </span>
            )}
            {formatPercent(share)}
            {marked && <span className="sr-only">{marked.word}</span>}
          </span>
          <span className="hidden h-1 w-10 overflow-hidden rounded-sm lg:block">
            <svg aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none" className="block size-full">
              <rect width="100" height="1" className={tone.track} />
              <rect width={Math.min(1, share) * 100} height="1" className={tone.fill} />
            </svg>
          </span>
          {reset && <span className="text-muted tabular-nums">in {reset}</span>}
        </>
      )}
    </li>
  );
}

/**
 * Whether the gateway may hand the account work: on, its knob lit and to the
 * right; off, paused. It names the change it makes when pointed at.
 */
function PauseSwitch({
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
      role="switch"
      aria-checked={!paused}
      aria-label="Take traffic"
      title={paused ? 'Resume' : 'Pause'}
      disabled={pending}
      onClick={onToggle}
      className="inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border-strong bg-raised hover:border-foreground disabled:cursor-wait"
    >
      <span
        aria-hidden="true"
        className={clsx(
          'size-3.5 rounded-full transition duration-200 motion-reduce:transition-none',
          paused ? 'translate-x-0.5 bg-muted' : 'translate-x-4.5 bg-ok'
        )}
      />
    </button>
  );
}

/**
 * One account as a band across the page, in three parts that never overlap.
 * On solid ground at the left: the big figure for its main usage window (the
 * one that resets last), who it is, when that window resets, and its other
 * windows as short lines. In the open middle: a chart of what it had used,
 * in its provider's colour, ending at now. At the end, with a broker: a
 * switch for whether it takes traffic. Trouble ahead (a window that runs dry
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
  // The switch moves as soon as it is flipped, and back if the broker refuses.
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
  const others = account.limits.filter(limit => limit !== primary);
  const switchable = controls && account.pausable;
  // Where each window is heading at its pace: only trouble is called out.
  const view = viewAccount(account, trends, now);
  const runsDry = new Set(view.limits.filter(entry => entry.verdict === 'dry').map(entry => entry.limit.id));
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
      className="relative overflow-hidden"
    >
      {drawn && (
        <>
          {/* A glow under a line, deepest under the line and fading towards the foot of
              the row. Its stops take the text colour, which is how a gradient wears a token.
              On a wide screen it has the middle of the row to itself, clear of the words
              and the switch; on a narrow one it runs behind the row and shows at its end. */}
          <div
            data-testid="history"
            aria-hidden="true"
            className={clsx('absolute inset-0 lg:left-204', controls && 'lg:right-19')}
          >
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
                    className={clsx('hidden lg:inline', tone.line)}
                  />
                </>
              )}
            </svg>
          </div>
          {/* Solid ground under the words; the chart fades in from it. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-full bg-linear-to-r from-surface via-surface via-85% to-transparent lg:left-204 lg:w-16 lg:via-0%"
          />
        </>
      )}

      <div
        className={clsx(
          'relative flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 lg:items-center lg:gap-x-6',
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
          {/* On a narrow row the switch sits at the end of this line, so only the name gives way to it. */}
          <div className={clsx('flex items-center gap-2 text-muted', switchable && 'pr-12 lg:pr-0')}>
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

        {/* A line of their own under a narrow row; a column beside the name on a wide one. */}
        {others.length > 0 && (
          <ul
            aria-label="Other windows"
            className="order-last flex basis-full flex-wrap gap-x-4 gap-y-1 lg:order-0 lg:w-64 lg:basis-auto lg:flex-col lg:gap-y-0.5"
          >
            {others.map(limit => (
              <WindowLine key={limit.id} limit={limit} tone={tone} dry={runsDry.has(limit.id)} now={now} />
            ))}
          </ul>
        )}

        {switchable && (
          <div className="absolute top-3 right-4 flex lg:static lg:ml-auto">
            <PauseSwitch
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
