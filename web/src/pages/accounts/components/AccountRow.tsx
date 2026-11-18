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
 * Another of the account's windows as a small meter: its name, how much of
 * it is used and when it resets, over a bar in the provider's colour.
 */
function WindowMeter({
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
    <li className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2 lg:w-32 lg:flex-none">
      <span className="truncate text-micro tracking-caps text-muted uppercase">{shortLimitLabel(limit)}</span>
      {share === undefined ? (
        <span className="text-micro text-muted">not reported</span>
      ) : (
        <span className="flex items-baseline justify-between gap-2">
          <span className={clsx('text-caption font-semibold whitespace-nowrap tabular-nums', figureClasses[severity])}>
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
          {reset && <span className="text-micro whitespace-nowrap text-muted tabular-nums">in {reset}</span>}
        </span>
      )}
      {/* The filled part is what is used; the figure above carries the state. */}
      <span className="block h-1 overflow-hidden rounded-sm">
        <svg aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none" className="block size-full">
          <rect width="100" height="1" className={tone.track} />
          {share !== undefined && <rect width={Math.min(1, share) * 100} height="1" className={tone.fill} />}
        </svg>
      </span>
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
 * One account as a band across the page, drawn over a chart of what it had
 * used, in its provider's colour. Trouble ahead (a window that runs dry
 * before it resets at its pace) is the only forecast it shows. It leads with
 * the big figure for its main usage window (the one that resets last), then
 * who it is and when that window resets. It ends in one panel: its other
 * windows as small meters, then its state, with a switch for taking traffic
 * when a broker is configured. Everything written sits on solid ground: the
 * chart fades in beside the name and runs behind the panel.
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
          'relative flex flex-col justify-center gap-2 px-4 py-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6',
          drawn ? 'min-h-20' : 'min-h-14'
        )}
      >
        <div className="flex min-w-0 items-center gap-4 lg:flex-1">
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
        </div>

        {/* The other windows and whether the account takes work, in one panel on solid
            ground so the chart runs behind it, never through it. */}
        <div
          data-testid="dock"
          className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface lg:shrink-0 lg:flex-row lg:divide-x lg:divide-y-0"
        >
          {others.length > 0 && (
            <ul aria-label="Other windows" className="flex min-w-0 divide-x divide-border">
              {others.map(limit => (
                <WindowMeter key={limit.id} limit={limit} tone={tone} dry={runsDry.has(limit.id)} now={now} />
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3 px-3 py-2 lg:w-32 lg:flex-col lg:items-start lg:justify-center lg:gap-1.5">
            <StatusBadge tone={stateTone}>{label}</StatusBadge>
            {controls && account.pausable && (
              <PauseSwitch
                paused={paused}
                pending={pause.isPending}
                onToggle={() => pause.mutate({ path: { accountId: account.id }, body: { paused: !paused } })}
              />
            )}
          </div>
        </div>

        {pause.isError && (
          // A line of its own under the row, on solid ground.
          <p role="alert" className="text-caption text-danger lg:basis-full lg:text-right">
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
