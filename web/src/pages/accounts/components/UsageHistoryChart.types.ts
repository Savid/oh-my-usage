import type { ReactNode } from 'react';
import type { Limit, UsageSample } from '@/api';

export interface UsageHistoryChartProps {
  /** The samples to draw, oldest first, as getAccountHistory answers them. */
  samples: readonly UsageSample[];

  /**
   * The account's provider. With `limits`, its main window is drawn first, in
   * the provider's colour with a glow under it, as on its row.
   */
  provider?: string;

  /** The account's windows, to name each line shortly and to find the main one. */
  limits?: readonly Limit[];

  /** The chart's heading, set at the start of the line its readout is on. */
  heading?: ReactNode;
}
