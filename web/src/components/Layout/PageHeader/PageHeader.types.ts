import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** The page's own first line, set beside the mark: where the page sits. */
  children?: ReactNode;

  /**
   * Whether the product's name is written beside the mark, as the heading of the homepage's band.
   * @default false
   */
  named?: boolean;
}
