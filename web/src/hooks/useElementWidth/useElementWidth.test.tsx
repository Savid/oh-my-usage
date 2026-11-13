import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@/test-utils';
import { useElementWidth } from './useElementWidth';

function Probe(): JSX.Element {
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  return <div ref={ref}>{width}</div>;
}

describe('useElementWidth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the fallback where elements cannot be measured', () => {
    render(<Probe />);

    expect(screen.getByText('720')).toBeInTheDocument();
  });

  it('follows the element as it resizes, and stops when it is gone', () => {
    let resize: ((width: number) => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
          resize = width => callback([{ contentRect: { width } }]);
        }
        observe(): void {}
        disconnect = disconnect;
      }
    );

    const { unmount } = render(<Probe />);
    act(() => resize?.(1179.6));

    expect(screen.getByText('1180')).toBeInTheDocument();

    // A width of nothing is an element not laid out yet: keep the last one.
    act(() => resize?.(0));
    expect(screen.getByText('1180')).toBeInTheDocument();

    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
