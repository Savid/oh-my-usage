import type { ReactNode } from 'react';

export interface PanelProps {
  /** The heading on the panel's head, in capitals. Without it the panel has no head. */
  title?: ReactNode;

  /** A count beside the heading, on a quiet badge. */
  count?: number;

  /** What sits at the end of the head: a control, or a few quiet words. */
  aside?: ReactNode;

  /**
   * The hairline in the mark's gradient along the top: `strong` on the band a
   * page opens on, `quiet` on a panel under it.
   * @default 'quiet'
   */
  hairline?: 'strong' | 'quiet';

  /** Names the panel to a screen reader in place of its heading, or when it has none. */
  label?: string;

  /** What the panel holds, under its head. */
  children: ReactNode;
}
