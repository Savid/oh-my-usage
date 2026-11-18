import { useLayoutEffect, useRef, type JSX } from 'react';
import clsx from 'clsx';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { RollingNumberProps } from './RollingNumber.types';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** How long a digit takes to roll to its next value, and how it slows into place. */
const ROLL_MS = 700;
const ROLL_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

// Each digit's column of ten, moved up so the digit shows: a tenth of the column a step.
const digitClasses: Record<string, string> = {
  '0': 'translate-y-0',
  '1': '-translate-y-1/10',
  '2': '-translate-y-1/5',
  '3': '-translate-y-3/10',
  '4': '-translate-y-2/5',
  '5': '-translate-y-1/2',
  '6': '-translate-y-3/5',
  '7': '-translate-y-7/10',
  '8': '-translate-y-4/5',
  '9': '-translate-y-9/10',
};

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

/** One digit in a window a digit high, over a column of all ten that rolls to the new one. */
function Digit({ digit }: { digit: string }): JSX.Element {
  const columnRef = useRef<HTMLSpanElement>(null);
  const shownRef = useRef(digit);
  const still = usePrefersReducedMotion();

  // The class holds the digit in place; the animation only carries it there.
  // It moves the property the class sets (Tailwind's translate-y sets
  // `translate`, not `transform`): moving the other would add the two, and
  // the wheel would roll past its digit and snap back.
  useLayoutEffect(() => {
    const from = shownRef.current;
    shownRef.current = digit;
    const element = columnRef.current;
    if (from === digit || still || !element || typeof element.animate !== 'function') return;

    element.animate([{ translate: `0 ${-Number(from) * 10}%` }, { translate: `0 ${-Number(digit) * 10}%` }], {
      duration: ROLL_MS,
      easing: ROLL_EASING,
    });
  }, [digit, still]);

  return (
    <span className="relative inline-block overflow-hidden">
      <span className="invisible">0</span>
      <span ref={columnRef} className={clsx('absolute inset-x-0 top-0 flex flex-col', digitClasses[digit])}>
        {DIGITS.map(value => (
          <span key={value}>{value}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * A figure whose digits roll to their new values like an odometer's when it
 * changes, each digit on its own wheel. Without motion it simply changes.
 * Assistive technology reads the figure whole.
 */
export function RollingNumber({ value, className }: RollingNumberProps): JSX.Element {
  // Each character's place counted from the right, so the units stay the
  // units when the figure grows a digit.
  const chars = [...value].map((char, index, all) => ({ char, place: all.length - index }));

  return (
    <span className={clsx('inline-flex tabular-nums', className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex">
        {chars.map(({ char, place }) =>
          isDigit(char) ? <Digit key={place} digit={char} /> : <span key={`${place}${char}`}>{char}</span>
        )}
      </span>
    </span>
  );
}
