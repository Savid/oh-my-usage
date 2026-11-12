import type { UsageSample } from '@/api';

export interface UsageHistoryChartProps {
  /** The samples to draw, oldest first, as getAccountHistory answers them. */
  samples: readonly UsageSample[];
}
