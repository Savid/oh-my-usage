import { type JSX, useId } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { LogoProps } from './Logo.types';

// oh-my-pi's mark, in the units it is drawn in: a bar over a short leg and a long one.
const PI = 'M14 16h36v8H40v32h-8V24h-6v22h-8V24h-4z';
const BAR = 'M14 16h36v8H14z';

interface Leg {
  name: string;
  x: number;
  /** How far the leg hangs below the bar. */
  length: number;
  /** How much of that is filled when the mark is still. */
  used: number;
  /** Seconds from one reset to the next. */
  period: number;
}

// Each leg is a meter with a window of its own, as an account's limits are: a short one and a long one.
const LEGS: readonly Leg[] = [
  { name: 'short', x: 18, length: 22, used: 13, period: 7 },
  { name: 'long', x: 32, length: 32, used: 23, period: 16 },
];

/** Seconds a full meter waits before its window resets, and that the reset takes. */
const HOLD = 0.5;
const RESET = 0.4;

/** A meter's window: it fills at a steady pace from where it stands, waits full, empties, and fills back. */
function cycle({ length, used, period }: Leg): { values: string; keyTimes: string; dur: string } {
  const filling = period - HOLD - RESET;
  const full = ((length - used) / length) * filling;
  const times = [0, full, full + HOLD, full + HOLD + RESET, period];

  return {
    values: [used, length, length, 0, used].join(';'),
    keyTimes: times.map(time => Number((time / period).toFixed(4))).join(';'),
    dur: `${period}s`,
  };
}

/**
 * The product's mark: oh-my-pi's pi, with its two legs turned into usage
 * meters. Each fills, and empties when its window resets. It is decorative:
 * the product's name is written beside it.
 */
export function Logo({ animated = true }: LogoProps): JSX.Element {
  const still = usePrefersReducedMotion();
  const moving = animated && !still;
  const gradientId = useId();
  const fill = `url(#${gradientId})`;

  return (
    <svg aria-hidden="true" viewBox="10 14 44 44" className="size-7 shrink-0" data-moving={moving}>
      <defs>
        {/* One gradient across the whole mark, so the bar and both legs are cut from the same sheet. */}
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="14" y1="16" x2="50" y2="56">
          <stop offset="0" stopColor="currentColor" className="text-mark-magenta" />
          <stop offset="0.5" stopColor="currentColor" className="text-mark-iris" />
          <stop offset="1" stopColor="currentColor" className="text-mark-cyan" />
        </linearGradient>
      </defs>
      {/* The whole pi, dim: the empty part of each meter. */}
      <path d={PI} fill={fill} opacity="0.3" data-testid="track" />
      <path d={BAR} fill={fill} />
      {LEGS.map(leg => (
        <rect key={leg.name} x={leg.x} y="24" width="8" height={leg.used} fill={fill} data-testid="meter">
          {moving && <animate attributeName="height" repeatCount="indefinite" {...cycle(leg)} />}
        </rect>
      ))}
    </svg>
  );
}
