import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { UsageTrend } from '@/api';
import { listUsageTrendsOptions } from '@/api/@tanstack/react-query.gen';

/** How far back the charts reach. */
const HISTORY_MS = 7 * 24 * 3_600_000;

/**
 * The charts' start moves in steps of this, so the query keyed on it holds
 * still between steps and refetches once per step.
 */
const STEP_MS = 5 * 60_000;

export interface Charts {
  /** Seven days before `now`, held to a five-minute step, in milliseconds. */
  since: number;
  /** Every limit's recorded usage since `since`; empty until it loads. */
  trends: readonly UsageTrend[];
  /** True when the recorded usage could not be read, so the charts show levels only. */
  failed: boolean;
}

const NO_TRENDS: readonly UsageTrend[] = [];

/** The recorded usage the charts draw, over the last seven days. */
export function useCharts(now: number): Charts {
  const since = Math.floor(now / STEP_MS) * STEP_MS - HISTORY_MS;
  const query = useQuery({
    ...listUsageTrendsOptions({ query: { since: new Date(since).toISOString() } }),
    placeholderData: keepPreviousData,
  });

  return { since, trends: query.data?.trends ?? NO_TRENDS, failed: query.isError };
}
