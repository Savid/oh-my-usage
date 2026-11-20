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

/**
 * The saved resets in a few words: how many, how many can be spent, and when
 * the first that can be spent expires. When one has to be spent before its
 * window resets or be lost, the words say so, and the account is in trouble.
 */
function savedResets(account: Account, now: number): { said: string; lapsing: boolean } | undefined {
  const resets = account.resets;
  if (!resets || resets.available === 0) return undefined;

  const held = `${resets.available} ${resets.available === 1 ? 'reset' : 'resets'}`;
  const usable = resets.usable === undefined ? '' : `, ${resets.usable} usable`;
  const outlook = resetOutlook(account, now);
  if (outlook.lapsingAt !== undefined) {
    const which = outlook.lapsing === 1 ? 'one' : String(outlook.lapsing);
    return { said: `${held}${usable}, spend ${which} within ${formatShort(outlook.lapsingAt - now)}`, lapsing: true };
  }

  const one = resets.available === 1 ? '' : ' one';
  const lapses = outlook.nextAt === undefined ? '' : `,${one} lapses in ${formatShort(outlook.nextAt - now)}`;
  return { said: `${held}${usable}${lapses}`, lapsing: false };
}

/**
 * What follows the name: organisation, plan, price, saved resets, and how old
 * the usage is when it is old. Resets about to lapse lead, apart, so the line
 * never cuts them off.
 */
function about(account: Account, now: number): { alarm?: string; said: string } {
  const parts: string[] = [];
  // A personal organisation is named after its owner's email, which the row already shows.
  if (account.orgName && !(account.email && account.orgName.startsWith(account.email))) parts.push(account.orgName);
  // A plan named after the provider says nothing the name does not.
  if (account.plan && !accountTitle(account).includes(account.plan)) parts.push(account.plan);
  if (account.kind === 'api_key' && account.email) parts.push('API key');
  if (account.monthlyUsd !== undefined) parts.push(`${formatPrice(account.monthlyUsd)}/mo`);

  const resets = savedResets(account, now);
  if (resets && !resets.lapsing) parts.push(resets.said);

  if (account.fetchedAt && now - Date.parse(account.fetchedAt) > STALE_MS) {
    parts.push(`usage ${formatShort(now - Date.parse(account.fetchedAt))} old`);
  }

  return { alarm: resets?.lapsing ? resets.said : undefined, said: parts.join(' · ') };
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

/** Where a share sits up the chart, in its units: as `sparkPaths` places it. */
function levelY(value: number): number {
  return 1 + (1 - Math.min(Math.max(value, 0), 1)) * (HEIGHT - 1);
}

/** Another window's line over the same span as the main one's, ending at its current value. */
function trace(points: readonly TrendPoint[], used: number, from: number, now: number): string | undefined {
  const recorded: SparkPoint[] = points
    .map(point => ({ time: Date.parse(point.at), value: point.usedFraction }))
    .filter(point => point.time >= from && point.time <= now);
  return sparkPaths([...recorded, { time: now, value: used }], from, now, WIDTH, HEIGHT)?.line;
}

/** A window this many times shorter than the chart runs through cycles too fast for a line: it is drawn as bars. */
const BARS_FROM = 4;

/**
 * A short window's busiest moment in each stretch of its own length, counted
 * back from now, as bars rising from the foot on the chart's own scale: one
 * path, a rectangle a stretch, with a gap between.
 */
function peaks(points: readonly TrendPoint[], used: number, windowMs: number, from: number, now: number): string {
  const span = now - from;
  const x = (time: number): number => ((time - from) / span) * WIDTH;
  const values = [
    ...points
      .map(point => ({ time: Date.parse(point.at), value: point.usedFraction }))
      .filter(point => point.time >= from && point.time <= now),
    { time: now, value: used },
  ];
  const bars: string[] = [];
  for (let end = now; end > from; end -= windowMs) {
    const start = Math.max(from, end - windowMs);
    const inside = values.filter(point => point.time > start && point.time <= end);
    if (inside.length === 0) continue;
    const top = Math.max(...inside.map(point => point.value));
    if (top <= 0) continue;
    const gap = (x(end) - x(start)) * 0.45;
    bars.push(
      `M${(x(start) + gap / 2).toFixed(2)} ${HEIGHT} V${levelY(top).toFixed(2)} H${(x(end) - gap / 2).toFixed(2)} V${HEIGHT} Z`
    );
  }
  return bars.join(' ');
}

// A label's height in tenths of the row's: each sits in a tenth, with one free between.
const SLOT_GAP = 2;
const slotClasses = [
  'top-0',
  'top-1/10',
  'top-1/5',
  'top-3/10',
  'top-2/5',
  'top-1/2',
  'top-3/5',
  'top-7/10',
  'top-4/5',
  'top-9/10',
  'top-full',
] as const;

/**
 * Tenths of the chart's height for labels that want to sit at `wanted`
 * (0 to 1, top down), moved apart just enough not to overlap and kept off
 * the edges. Each keeps its order.
 */
function spread(wanted: readonly number[]): number[] {
  const order = wanted.map((at, index) => ({ index, slot: Math.round(at * 10) })).sort((a, b) => a.slot - b.slot);
  const last = order.length - 1;
  order.forEach((entry, k) => {
    entry.slot = Math.max(entry.slot, 1, k > 0 ? order[k - 1]!.slot + SLOT_GAP : 1);
  });
  for (let k = last; k >= 0; k--) {
    order[k]!.slot = Math.min(order[k]!.slot, k < last ? order[k + 1]!.slot - SLOT_GAP : 9);
  }
  const slots: number[] = [];
  for (const entry of order) slots[entry.index] = Math.max(0, entry.slot);
  return slots;
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
  dry: boolean;
  /** When it resets, when that is not when the main window does. */
  reset?: string;
  /** Its line in the chart, when usage was recorded and it lasts long enough to draw as one. */
  line?: string;
  /** Its peaks as bars, when it is short beside the chart. */
  bars?: string;
  /** Where it ends up the chart, in the chart's units. */
  y: number;
  /** What a screen reader hears. */
  said: string;
}

/** The share, marked when it is in trouble, in the colour of its state. */
function WindowShare({ window: other }: { window: OtherWindow }): JSX.Element {
  const marked = severityMarks[other.severity];
  const mark = other.dry ? '▲' : marked?.mark;
  return (
    <span
      className={clsx(
        'font-semibold tabular-nums',
        other.share === undefined ? 'text-muted' : figureClasses[other.severity]
      )}
    >
      {mark && <span className={clsx(other.dry && 'text-danger')}>{mark} </span>}
      {other.share === undefined ? '–' : formatPercent(other.share)}
    </span>
  );
}

/**
 * Another of the account's windows in words: its tag, its share and when it
 * resets. On a narrow screen these share a line under the row; on a wide one
 * the chart carries them, and the list is for assistive technology.
 */
function WindowLine({ window: other }: { window: OtherWindow }): JSX.Element {
  return (
    <li className="flex items-baseline gap-1.5 text-micro whitespace-nowrap">
      <span className="sr-only">{other.said}</span>
      <span aria-hidden="true" className="tracking-caps text-muted uppercase">
        {other.tag}
      </span>
      <span aria-hidden="true">
        <WindowShare window={other} />
      </span>
      {other.reset && (
        <span aria-hidden="true" className="text-muted tabular-nums">
          in {other.reset}
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

  const primaryTag = primary ? limitTag(primary) : undefined;
  const others: OtherWindow[] = view.limits
    .filter(entry => entry.limit !== primary)
    .map(({ limit, verdict }) => {
      const share = limit.usedFraction;
      const severity = limitSeverity(limit);
      const dry = verdict === 'dry';
      const full = resetIn(limit, now);
      // A window that resets with the main one says nothing new by saying when.
      const together =
        primary?.resetsAt !== undefined &&
        limit.resetsAt !== undefined &&
        Math.abs(Date.parse(limit.resetsAt) - Date.parse(primary.resetsAt)) < 3_600_000;
      const length = primaryTag?.split(' ')[0];
      const tag = limitTag(limit);
      const name = shortLimitLabel(limit);
      const points = trends.find(trend => trend.accountId === account.id && trend.limitId === limit.id)?.points ?? [];
      const charted = drawn && !drawn.level && share !== undefined ? drawn : undefined;
      const windowMs = limit.windowSeconds === undefined ? undefined : limit.windowSeconds * 1000;
      const short = charted && windowMs !== undefined && windowMs * BARS_FROM <= now - charted.from;
      return {
        limit,
        tag: length && tag.startsWith(`${length} `) ? tag.slice(length.length + 1) : tag,
        share,
        severity,
        dry,
        reset: together ? undefined : full,
        line: charted && !short ? trace(points, share ?? 0, charted.from, now) : undefined,
        bars: charted && short && windowMs ? peaks(points, share ?? 0, windowMs, charted.from, now) : undefined,
        y: levelY(share ?? 0),
        said:
          share === undefined
            ? `${name}: not reported`
            : `${name}: ${formatPercent(share)} used${severityMarks[severity]?.word ?? ''}${dry ? ', runs dry before it resets' : ''}${full ? `, resets in ${full}` : ''}`,
      };
    });
  const slots = spread(others.map(other => other.y / HEIGHT));

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
          <div data-testid="history" aria-hidden="true" className="absolute inset-y-0 right-3 left-0 lg:left-134">
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
              {/* A short window's peaks: quiet bars on the same scale, behind the glow, so a session
                  that hit its limit stands as tall as the row. */}
              {others.map(
                other =>
                  other.bars && (
                    <path key={other.limit.id} data-window={other.limit.id} d={other.bars} className="fill-border" />
                  )
              )}
              <path d={drawn.area} fill={`url(#${glowId})`} />
              {/* The longer ones: thin and quiet lines under the main one, each ending in a small dot. */}
              <g fill="none" className="stroke-muted">
                {others.map(
                  (other, index) =>
                    other.line && (
                      <path
                        key={other.limit.id}
                        data-window={other.limit.id}
                        d={other.line}
                        strokeWidth="1"
                        strokeLinejoin="round"
                        strokeDasharray={index % 2 === 1 ? '3 2' : undefined}
                        vectorEffect="non-scaling-stroke"
                      />
                    )
                )}
                {others.map(
                  other =>
                    other.line && (
                      <line
                        key={other.limit.id}
                        x1={WIDTH}
                        x2={WIDTH}
                        y1={other.y}
                        y2={other.y}
                        strokeWidth="3"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    )
                )}
              </g>
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
            {/* On a wide screen each other window is named on its line, short of the row's end,
                moved apart from the others just enough to be read. */}
            {others.map((other, index) => (
              <span
                key={other.limit.id}
                className={clsx(
                  'absolute right-10 hidden -translate-y-1/2 items-baseline gap-1.5 rounded-sm bg-surface px-1 text-micro whitespace-nowrap lg:flex',
                  slotClasses[slots[index] ?? 9]
                )}
              >
                <span className="tracking-caps text-muted uppercase">{other.tag}</span>
                <WindowShare window={other} />
                {other.reset && <span className="text-muted tabular-nums">in {other.reset}</span>}
              </span>
            ))}
          </div>
          {/* The chart fades in from the ground at its start. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-16 bg-linear-to-r from-surface to-transparent lg:left-134"
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
          {(meta.alarm || meta.said) && (
            <p className="truncate text-micro text-muted">
              {meta.alarm && (
                <span className="text-warn">
                  <span aria-hidden="true">▲ </span>
                  {meta.alarm}
                </span>
              )}
              {meta.alarm && meta.said && ' · '}
              {meta.said}
            </p>
          )}
        </div>

        {/* A line of their own under a narrow row. On a wide one the chart names them, so
            the list is only heard, unless there is no chart to name them on. */}
        {others.length > 0 && (
          <ul
            aria-label="Other windows"
            className={clsx('order-last flex basis-full flex-wrap gap-x-4 gap-y-1', drawn && 'lg:sr-only')}
          >
            {others.map(other => (
              <WindowLine key={other.limit.id} window={other} />
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
