import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /**
   * The page's name, set beside the mark after the accounts it came from
   * (`Accounts / Traffic`), as the page's heading. The homepage has none.
   */
  title?: string;

  /** More of the page's first line, after its name. */
  children?: ReactNode;
}
