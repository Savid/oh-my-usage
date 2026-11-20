import type { ReactNode } from 'react';

export type NoticeTone = 'warn' | 'danger';

export interface NoticeProps {
  /**
   * `warn` when the page still shows something, if old or partial; `danger` when it has nothing to show.
   * @default 'warn'
   */
  tone?: NoticeTone;

  /** What is wrong, in a few words. */
  title: string;

  /** What it means for what the page shows, or why. */
  children?: ReactNode;
}
