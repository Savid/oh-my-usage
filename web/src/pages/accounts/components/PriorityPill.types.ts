import type { Priority } from '@/lib/priority';

export interface PriorityPillProps {
  /** Where the gateway would pick the account, and why. */
  priority: Priority;

  /**
   * When the reason shows beside the place: `always`; `wide`, on a wide
   * screen only; `never`, where a badge already says it. A screen reader
   * hears it whenever it is hidden on a wide screen only.
   * @default 'always'
   */
  reason?: 'always' | 'wide' | 'never';
}
