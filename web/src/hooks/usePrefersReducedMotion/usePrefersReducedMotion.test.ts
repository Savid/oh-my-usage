import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/test-utils';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/** A `matchMedia` whose answer the test can change. */
function stubMatchMedia(matches: boolean): { set: (next: boolean) => void } {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => media);

  return {
    set: next => {
      media.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

describe('usePrefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is false where the browser cannot say', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });

  it('follows the system setting as it changes', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(true);

    act(() => media.set(false));

    expect(result.current).toBe(false);
  });
});
