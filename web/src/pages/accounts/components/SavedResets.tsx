import type { JSX } from 'react';
import { StatusBadge } from '@/components/Feedback/StatusBadge';
import { shortLimitLabel } from '@/lib/accounts';
import { formatShort } from '@/lib/format';
import type { SavedResetsProps } from './SavedResets.types';

/**
 * The limit resets an account holds and has not spent: what each is, which
 * windows spending it would clear, whether it can be spent now, and when it
 * lapses. Spending one is done in omp, not here.
 */
export function SavedResets({ resets, limits, now }: SavedResetsProps): JSX.Element {
  // The provider gives a reset no ID: its key is what it says, numbered where two say the same.
  const seen = new Map<string, number>();
  const saved = (resets?.saved ?? []).map(reset => {
    const said = `${reset.title ?? ''}|${reset.clears.join(',')}|${reset.expiresAt ?? ''}`;
    const nth = seen.get(said) ?? 0;
    seen.set(said, nth + 1);
    return { ...reset, key: `${said}#${nth}` };
  });
  const undescribed = Math.max(0, (resets?.available ?? 0) - saved.length);
  const nameOf = (id: string): string => {
    const limit = limits.find(candidate => candidate.id === id);
    return limit ? shortLimitLabel(limit) : id;
  };

  return (
    <section
      aria-labelledby="resets-heading"
      className="flex min-w-0 flex-1 flex-col gap-2 rounded-md border border-border bg-surface p-3"
    >
      <div className="flex items-baseline gap-2">
        <h2 id="resets-heading" className="text-micro font-semibold tracking-caps text-muted uppercase">
          Saved resets
        </h2>
        {resets && resets.available > 0 && (
          <span className="ml-auto text-caption text-muted tabular-nums">
            {resets.available} held
            {resets.usable !== undefined && `, ${resets.usable} usable now`}
          </span>
        )}
      </div>

      {!resets || resets.available === 0 ? (
        <p className="text-caption text-muted">This account holds no saved resets.</p>
      ) : (
        <>
          {saved.length > 0 && (
            <ul className="flex flex-col divide-y divide-border">
              {saved.map(reset => (
                <li key={reset.key} className="flex flex-col gap-0.5 py-1.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-body font-medium" title={reset.title}>
                      {reset.title ?? 'A limit reset'}
                    </span>
                    {reset.usable !== undefined && (
                      <span className="ml-auto shrink-0">
                        <StatusBadge tone={reset.usable ? 'ok' : 'neutral'}>
                          {reset.usable ? 'usable now' : 'not usable now'}
                        </StatusBadge>
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-muted">
                    {reset.clears.length > 0
                      ? `Clears ${reset.clears.map(nameOf).join(', ')}`
                      : 'What it clears is not said'}
                    {' · '}
                    {reset.expiresAt === undefined ? (
                      'does not expire'
                    ) : (
                      <>
                        expires in{' '}
                        <span className="font-semibold text-foreground tabular-nums">
                          {formatShort(Date.parse(reset.expiresAt) - now)}
                        </span>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {undescribed > 0 && (
            <p className="text-caption text-muted">
              {saved.length > 0 ? `And ${undescribed} more` : `${undescribed}`} the provider did not describe.
            </p>
          )}
        </>
      )}
    </section>
  );
}
