import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};

  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function snapshot(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/**
 * Whether the viewer asked their system for less motion, kept current if they
 * change it. For motion CSS cannot switch off, such as an animation written
 * into an SVG.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
