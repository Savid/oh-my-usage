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
  resetOutlook,
  shortLimitLabel,
  type LimitSeverity,
} from '@/lib/accounts';
import { viewAccount } from '@/lib/fleet';
import { formatPace, formatPercent, formatPrice, formatShort } from '@/lib/format';
import { ordinal, type Priority } from '@/lib/priority';
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

// Information, not trouble: blue for an account the gateway picks, grey for one it holds back.
const priorityClasses: Record<Priority['standing'], string> = {
  ranked: 'bg-info-subtle text-info',
  later: 'bg-raised text-muted',
  last: 'bg-raised text-muted',
};

/** The account's state in a word: paused wins, then omp's own block. */
function state(account: Account, now: number): { tone: StatusTone; label: string } {
  if (account.paused) return { tone: 'warn', label: 'paused' };
  if (account.blockedUntil && Date.parse(account.blockedUntil) > now) {
    return { tone: 'danger', label: `blocked ${formatShort(Date.parse(account.blockedUntil) - now)}` };
  }
  return { tone: 'ok', label: 'active' };
}

/** A wait for a chip: whole days once it is two or more, which is close enough at a glance. */
function roughly(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  return days >= 2 ? `${days}d` : formatShort(ms);
}

/** The saved resets as a chip: short on the row, the whole sentence on hover and to a screen reader. */
interface ResetsChip {
  short: string;
  full: string;
  /** One must be spent before its window resets, or be lost. */
  lapsing: boolean;
}

/**
 * The saved resets in a chip: how many can be spent of how many are held, and
 * when the first that can be spent lapses (`↻ 1/3 · 109d`). One that has to be
 * spent before its window resets, or be lost, is trouble: `▲ spend 1 in 12h`.
 */
function savedResets(account: Account, now: number): ResetsChip | undefined {
  const resets = account.resets;
  if (!resets || resets.available === 0) return undefined;

  const held = `${resets.available} saved ${resets.available === 1 ? 'reset' : 'resets'}`;
  const usable = resets.usable === undefined ? '' : `, ${resets.usable} usable now`;
  const outlook = resetOutlook(account, now);
  if (outlook.lapsingAt !== undefined) {
    const within = formatShort(outlook.lapsingAt - now);
    return {
      short: `spend ${outlook.lapsing} in ${roughly(outlook.lapsingAt - now)}`,
      full: `${held}${usable}: spend ${outlook.lapsing === 1 ? 'one' : outlook.lapsing} within ${within}, before its window resets, or lose it`,
      lapsing: true,
    };
  }

  const count = resets.usable === undefined ? `${resets.available}` : `${resets.usable}/${resets.available}`;
  const lapses = outlook.nextAt === undefined ? undefined : formatShort(outlook.nextAt - now);
  return {
    short: outlook.nextAt === undefined ? count : `${count} · ${roughly(outlook.nextAt - now)}`,
    full: `${held}${usable}${lapses === undefined ? '' : `; the first lapses in ${lapses}`}`,
    lapsing: false,
  };
}

/** Who the account is beyond its name: organisation, plan and price. */
function about(account: Account): string {
  const parts: string[] = [];
  // A personal organisation is named after its owner's email, which the row already shows.
  if (account.orgName && !(account.email && account.orgName.startsWith(account.email))) parts.push(account.orgName);
  // A plan named after the provider says nothing the name does not.
  if (account.plan && !accountTitle(account).includes(account.plan)) parts.push(account.plan);
  if (account.kind === 'api_key' && account.email) parts.push('API key');
  if (account.monthlyUsd !== undefined) parts.push(`${formatPrice(account.monthlyUsd)}/mo`);
  return parts.join(' · ');
}

/** How old the usage is, when it is old; undefined while it is current. */
function staleness(account: Account, now: number): string | undefined {
  if (!account.fetchedAt || now - Date.parse(account.fetchedAt) <= STALE_MS) return undefined;
  return `usage ${formatShort(now - Date.parse(account.fetchedAt))} old`;
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
): SparkPaths & { level: boolean; from: number } {
  const recorded: SparkPoint[] = points
    .map(point => ({ time: Date.parse(point.at), value: point.usedFraction }))
    .filter(point => point.time >= start && point.time <= now);

  // The chart spans the row, so it begins where this account's history does:
  // one recorded for less than the period would otherwise leave a gap.
  const from = Math.max(start, recorded[0]?.time ?? start);
  const drawn = sparkPaths([...recorded, { time: now, value: used }], from, now, WIDTH, HEIGHT);
  if (recorded.length > 0 && drawn) return { ...drawn, level: false, from };

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
  return { line: '', area: flat?.area ?? '', end: flat?.end ?? { x: WIDTH, y: HEIGHT }, level: true, from };
}

function resetIn(limit: Limit, now: number): string | undefined {
  return limit.resetsAt ? formatShort(Date.parse(limit.resetsAt) - now) : undefined;
}

/** Another of the account's windows, ready to draw and to say. */
interface OtherWindow {
  limit: Limit;
  /** Its name in a few letters; the length is left off when the main window's is the same. */
  tag: string;
  share?: number;
  severity: LimitSeverity;
  /** When it resets, when that is not when the main window does. */
  reset?: string;
  /** What a screen reader hears. */
  said: string;
}

/** The share, marked when it is in trouble, in the colour of its state. */
function WindowShare({ window: other }: { window: OtherWindow }): JSX.Element {
  const mark = severityMarks[other.severity]?.mark;
  return (
    <span
      className={clsx(
        'font-semibold tabular-nums',
        other.share === undefined ? 'text-muted' : figureClasses[other.severity]
      )}
    >
      {mark && <span>{mark} </span>}
      {other.share === undefined ? '–' : formatPercent(other.share)}
    </span>
  );
}

/** A window with nothing used, or nothing reported, says nothing worth showing; it is still heard. */
function quiet(other: OtherWindow): boolean {
  return other.share === undefined || other.share === 0;
}

/**
 * Another of the account's windows on the line under the name, after a dot:
 * its tag and its share, marked when in trouble. When it resets is heard, and
 * on the account's page.
 */
function WindowLine({ window: other }: { window: OtherWindow }): JSX.Element {
  return (
    <li className={clsx('inline whitespace-nowrap', quiet(other) && 'sr-only')}>
      <span className="sr-only">{other.said}</span>
      <span aria-hidden="true">
        {' · '}
        {other.tag} <WindowShare window={other} />
      </span>
    </li>
  );
}

/**
 * Pauses the account or resumes it: a small round button at the row's end.
 * With a mouse it shows when the row is pointed at, so the chart runs
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
 * end, with a broker: a small button to pause or resume it. Its state shows
 * only when it is not taking work.
 */
export function AccountRow({
  account,
  trends,
  start,
  now,
  controls,
  priority,
  headingLevel = 3,
}: AccountRowProps): JSX.Element {
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
  const old = staleness(account, now);
  const resets = savedResets(account, now);

  const primary = primaryLimit(account.limits);
  const used = primary?.usedFraction;
  const severity = primary ? limitSeverity(primary) : 'normal';
  const marked = severityMarks[severity];
  const reset = primary ? resetIn(primary, now) : undefined;
  const pausable = controls && account.pausable;
  // Each window with its pace, and whether the account is idle.
  const view = viewAccount(account, trends, now);
  // The second look, on hover over the name: who it is beyond its name, its saved resets and its pace.
  const details = [
    about(account),
    resets && !resets.lapsing ? resets.full : undefined,
    view.burn !== undefined && view.burn > 0 ? `+${formatPace(view.burn)}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const drawn =
    primary && used !== undefined
      ? chart(
          trends.find(trend => trend.accountId === account.id && trend.limitId === primary.id)?.points ?? [],
          used,
          start,
          now
        )
      : undefined;

  const primaryTag = primary ? limitTag(primary) : undefined;
  const others: OtherWindow[] = view.limits
    .filter(entry => entry.limit !== primary)
    .map(({ limit }) => {
      const share = limit.usedFraction;
      const severity = limitSeverity(limit);
      const full = resetIn(limit, now);
      // A window that resets with the main one says nothing new by saying when.
      const together =
        primary?.resetsAt !== undefined &&
        limit.resetsAt !== undefined &&
        Math.abs(Date.parse(limit.resetsAt) - Date.parse(primary.resetsAt)) < 3_600_000;
      const length = primaryTag?.split(' ')[0];
      const tag = limitTag(limit);
      const name = shortLimitLabel(limit);
      return {
        limit,
        tag: length && tag.startsWith(`${length} `) ? tag.slice(length.length + 1) : tag,
        share,
        severity,
        reset: together ? undefined : full,
        said:
          share === undefined
            ? `${name}: not reported`
            : `${name}: ${formatPercent(share)} used${severityMarks[severity]?.word ?? ''}${full ? `, resets in ${full}` : ''}`,
      };
    });

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
              On a wide screen it runs from where the words end to the row's end, behind nothing but
              the pause; on a narrow one it is a strip along the row's foot, under the words. Either
              way it is the main window's line alone. */}
          <div
            data-testid="history"
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-7 lg:top-0 lg:right-3 lg:left-134 lg:h-auto"
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
                    className={tone.line}
                  />
                </>
              )}
            </svg>
          </div>
          {/* The chart fades in from the ground at its start. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-16 bg-linear-to-r from-surface to-transparent max-lg:hidden lg:left-134"
          />
        </>
      )}

      <div
        className={clsx(
          // Haloed in the ground, so a chart's line never strikes the words; on a narrow row they
          // leave the foot to the chart's strip.
          'relative flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-3 text-shadow-halo lg:items-center lg:gap-x-6 lg:pb-3',
          drawn ? 'pb-9 lg:min-h-20' : 'min-h-14 pb-3'
        )}
      >
        {primary && used !== undefined ? (
          <p className="w-16 shrink-0 lg:w-24 lg:text-right">
            <span
              className={clsx('block text-heading font-semibold tabular-nums lg:text-display', figureClasses[severity])}
            >
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
          <p className="w-16 shrink-0 text-micro text-muted lg:w-24 lg:text-right">no usage reported</p>
        )}

        <div className="flex min-w-0 flex-1 flex-col lg:w-96 lg:flex-none">
          {/* On a narrow row the button sits at the end of this line, so only the name gives way to it. */}
          <div className={clsx('flex items-center gap-2 text-muted', pausable && 'pr-8 lg:pr-0')}>
            <ProviderIcon provider={account.provider} size="md" />
            <Heading id={headingId} className="min-w-0 truncate text-title font-semibold text-foreground">
              <Link
                to="/accounts/$accountId"
                params={{ accountId: account.id }}
                title={details || undefined}
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
            {priority && (
              <span
                data-testid="priority"
                data-standing={priority.standing}
                className={clsx(
                  'shrink-0 rounded-sm px-1.5 text-micro whitespace-nowrap',
                  priorityClasses[priority.standing]
                )}
              >
                <span className="sr-only">Gateway pick: </span>
                <span className="font-semibold">
                  {priority.rank === undefined ? priority.standing : ordinal(priority.rank)}
                </span>
                {/* A badge already says why an account is held back. On a narrow row only the
                    place shows, so the name keeps its room; the reason is still heard. */}
                {!(priority.standing === 'last' && stateTone !== 'ok') && (
                  <span className="sr-only lg:not-sr-only"> · {priority.reason}</span>
                )}
              </span>
            )}
          </div>
          {/* One line under the name: the main window and when it resets, the other windows in
              use, and only when there is trouble, a saved reset to spend or old usage. */}
          {(primary || others.length > 0 || resets?.lapsing || old) && (
            <div className="truncate text-caption text-muted">
              {primary && (
                <span>
                  {shortLimitLabel(primary)}
                  {reset && (
                    <>
                      {' · resets in '}
                      <span className="font-semibold text-foreground tabular-nums">{reset}</span>
                    </>
                  )}
                </span>
              )}
              {others.length > 0 && (
                <ul aria-label="Other windows" className="inline">
                  {others.map(other => (
                    <WindowLine key={other.limit.id} window={other} />
                  ))}
                </ul>
              )}
              {resets?.lapsing && (
                <span data-testid="resets" title={resets.full} className="text-warn">
                  <span aria-hidden="true"> · ▲ {resets.short}</span>
                  <span className="sr-only">{resets.full}</span>
                </span>
              )}
              {old && <span> · {old}</span>}
            </div>
          )}
        </div>

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
