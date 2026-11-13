import type { JSX } from 'react';
import clsx from 'clsx';
import { providerName } from '@/lib/accounts';
import { providerMark } from '@/lib/providerMarks';
import { providerTone } from '@/lib/providerTones';
import type { ProviderIconProps } from './ProviderIcon.types';

/**
 * A provider's mark, in the provider's colour. A provider this build has no
 * mark for gets its initial in a box, in the colour of secondary text.
 */
const sizeClasses = { sm: 'size-3.5', md: 'size-5' };

export function ProviderIcon({ provider, decorative = false, size = 'sm' }: ProviderIconProps): JSX.Element {
  const name = providerName(provider);
  const mark = providerMark(provider);
  const { icon } = providerTone(provider);
  const label = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name };

  if (!mark) {
    return (
      <svg {...label} viewBox="0 0 24 24" className={clsx('shrink-0', icon, sizeClasses[size])} data-mark="initial">
        <rect x="1" y="1" width="22" height="22" rx="4" fill="none" strokeWidth="2" className="stroke-current" />
        <text x="12" y="17" textAnchor="middle" className="fill-current text-title font-semibold">
          {name.charAt(0).toUpperCase()}
        </text>
      </svg>
    );
  }

  return (
    <svg
      {...label}
      viewBox="0 0 24 24"
      className={clsx('shrink-0 fill-current', icon, sizeClasses[size])}
      data-mark="logo"
    >
      {!decorative && <title>{name}</title>}
      {mark.paths.map(part => (
        <path key={part.d} d={part.d} fillRule={mark.evenOdd ? 'evenodd' : undefined} fillOpacity={part.opacity} />
      ))}
    </svg>
  );
}
