import type { JSX } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { LogoProps } from './Logo.types';

/** How much of the gauge the face wears, out of 100. */
const USED = 72;

// One blink every few seconds: open, shut and open again in a fraction of the cycle.
const BLINK = { values: '1.9;1.9;0.3;1.9;1.9', keyTimes: '0;0.9;0.94;0.98;1', dur: '5s' };

// The gauge fills quickly and settles: fast out, slow in.
// `fill: 'freeze'` is the animation's own attribute: it holds the last value, and is no colour.
const FILL = { dur: '1.4s', calcMode: 'spline', keyTimes: '0;1', keySplines: '0.2 0.8 0.2 1', fill: 'freeze' };

/**
 * The product's mark: a small round face ringed by a usage gauge, saying "oh
 * my" at how much is used. The gauge fills as it appears and the eyes blink.
 * It is decorative: the product's name is written beside it.
 */
export function Logo({ animated = true }: LogoProps): JSX.Element {
  const still = usePrefersReducedMotion();
  const moving = animated && !still;

  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7 shrink-0" data-moving={moving}>
      <circle cx="16" cy="16" r="12" fill="none" strokeWidth="3.5" className="stroke-border" />
      {/* Drawn from twelve o'clock; its length is counted out of 100. */}
      <circle
        cx="16"
        cy="16"
        r="12"
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray={`${USED} 100`}
        transform="rotate(-90 16 16)"
        className="stroke-meter"
      >
        {moving && <animate attributeName="stroke-dasharray" values={`0 100;${USED} 100`} {...FILL} />}
      </circle>

      <ellipse cx="12.4" cy="14.6" rx="1.5" ry="1.9" className="fill-foreground">
        {moving && <animate attributeName="ry" repeatCount="indefinite" {...BLINK} />}
      </ellipse>
      <ellipse cx="19.6" cy="14.6" rx="1.5" ry="1.9" className="fill-foreground">
        {moving && <animate attributeName="ry" repeatCount="indefinite" {...BLINK} />}
      </ellipse>

      {/* The mouth rounds into an "oh" as the gauge fills. */}
      <circle cx="16" cy="20.6" r="1.9" fill="none" strokeWidth="1.4" className="stroke-foreground">
        {moving && <animate attributeName="r" values="0.7;1.9" {...FILL} />}
      </circle>
    </svg>
  );
}
