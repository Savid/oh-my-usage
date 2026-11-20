import { useId, type JSX } from 'react';
import type { PanelProps } from './Panel.types';

const hairlineClasses: Record<NonNullable<PanelProps['hairline']>, string> = {
  strong: 'h-0.5 bg-linear-to-r from-mark-magenta via-mark-iris to-mark-cyan',
  quiet: 'h-px bg-linear-to-r from-mark-magenta via-mark-iris to-mark-cyan opacity-60',
};

/**
 * A card of the page, every page alike: a hairline in the mark's gradient
 * along its top, strong on the band a page opens on and quieter on the panels
 * under it, then a head with what it is, how many, and a control or a few
 * words at its end. A panel that is named is a region; one that is not is
 * only a frame.
 */
export function Panel({ title, count, aside, hairline = 'quiet', label, children }: PanelProps): JSX.Element {
  const headingId = useId();
  const named = label !== undefined || title !== undefined;
  const Frame = named ? 'section' : 'div';

  return (
    <Frame
      aria-label={label}
      aria-labelledby={label === undefined && title !== undefined ? headingId : undefined}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface"
    >
      <div aria-hidden="true" className={hairlineClasses[hairline]} />
      {title !== undefined && (
        <div className="flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border px-4 py-2">
          <h2 id={headingId} className="text-body font-semibold tracking-caps uppercase">
            {title}
          </h2>
          {count !== undefined && (
            <span className="rounded-sm bg-raised px-1.5 text-micro text-muted tabular-nums">{count}</span>
          )}
          {aside !== undefined && (
            <div className="ml-auto flex min-w-0 items-center gap-2 text-caption text-muted">{aside}</div>
          )}
        </div>
      )}
      {children}
    </Frame>
  );
}
