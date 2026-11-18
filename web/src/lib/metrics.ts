import { formatCount, formatPercent, formatUsd } from './format';
import type { TokenKinds } from './traffic';

/** What a traffic chart can show. */
export type Metric = 'output' | 'input' | 'cache' | 'cost' | 'requests';

/** Some traffic: tokens by kind, requests and their cost. */
export interface Amounts extends TokenKinds {
  requests: number;
  costUsd: number;
}

/** Everything sent to the provider: fresh input, and input read from or written to a cache. */
export function sentTokens(amounts: TokenKinds): number {
  return amounts.inputTokens + amounts.cacheReadTokens + amounts.cacheWriteTokens;
}

/** How much of a metric some traffic holds. For the cache share, the part: the tokens read from a cache. */
export function amountOf(amounts: Amounts, metric: Metric): number {
  switch (metric) {
    case 'output':
      return amounts.outputTokens;
    case 'input':
      return sentTokens(amounts);
    case 'cache':
      return amounts.cacheReadTokens;
    case 'cost':
      return amounts.costUsd;
    case 'requests':
      return amounts.requests;
  }
}

/** Whether a metric is a share from 0 to 1, of all that was sent, rather than an amount that adds up. */
export function isShare(metric: Metric): boolean {
  return metric === 'cache';
}

/** A requests figure to a tenth when it is a fraction under ten, whole otherwise. */
function formatRequests(value: number): string {
  return value < 10 && !Number.isInteger(value) ? value.toFixed(1) : formatCount(Math.round(value));
}

/** How each metric is named, how a figure of it reads, and what a rate of it is called. */
export const METRICS: readonly {
  id: Metric;
  name: string;
  /** What a chart of it shows, in words. */
  title: string;
  /** What follows an amount of it in a step, where the figure alone would not say: "tokens out". */
  noun: string;
  format: (value: number) => string;
  /** What follows a rate's figure on a chip: a second, an hour, a minute. */
  suffix: string;
  /** What follows a rate's figure when it stands alone. */
  unit: string;
}[] = [
  {
    id: 'output',
    name: 'Out',
    title: 'Tokens out',
    noun: 'tokens out',
    format: value => formatCount(Math.round(value)),
    suffix: '/s',
    unit: 'tokens out a second',
  },
  {
    id: 'input',
    name: 'In',
    title: 'Tokens in',
    noun: 'tokens in',
    format: value => formatCount(Math.round(value)),
    suffix: '/s',
    unit: 'tokens in a second, cache reads included',
  },
  {
    id: 'cache',
    name: 'Cached',
    title: 'Share read from a cache',
    noun: 'cached',
    format: formatPercent,
    suffix: '',
    unit: 'of input read from a cache',
  },
  {
    id: 'cost',
    name: 'Cost',
    title: 'Cost at API prices',
    noun: 'at API prices',
    format: formatUsd,
    suffix: '/h',
    unit: 'an hour at API prices',
  },
  {
    id: 'requests',
    name: 'Requests',
    title: 'Requests',
    noun: 'requests',
    format: formatRequests,
    suffix: '/min',
    unit: 'requests a minute',
  },
];

/** Whether a value names a metric, as a link's search may. */
export function isMetric(value: unknown): value is Metric {
  return METRICS.some(entry => entry.id === value);
}

/** A metric's entry in `METRICS`. */
export function metricInfo(metric: Metric): (typeof METRICS)[number] {
  const info = METRICS.find(entry => entry.id === metric);
  if (!info) throw new Error(`unknown metric ${metric}`);
  return info;
}
