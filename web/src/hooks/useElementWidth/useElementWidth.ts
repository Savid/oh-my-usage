import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * The width of an element in CSS pixels, kept current as it resizes, for a
 * drawing that must lay itself out to its container. Returns the ref to put
 * on the element and its width, which is `fallback` until it is measured.
 */
export function useElementWidth<T extends Element>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.width;
      if (measured) setWidth(Math.round(measured));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
