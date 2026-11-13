import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test-utils';
import { Logo } from './Logo';

describe('Logo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws the pi with a meter for each leg, hidden from assistive technology', () => {
    const { container } = render(<Logo />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('track')).toHaveAttribute('opacity', '0.3');
    // The short leg, then the long one, each part filled.
    expect(screen.getAllByTestId('meter').map(meter => meter.getAttribute('height'))).toEqual(['13', '23']);
  });

  it('wears one gradient, from magenta through iris to cyan', () => {
    const { container } = render(<Logo />);

    const gradient = container.querySelector('linearGradient');
    expect([...container.querySelectorAll('stop')].map(stop => stop.getAttribute('class'))).toEqual([
      'text-mark-magenta',
      'text-mark-iris',
      'text-mark-cyan',
    ]);
    for (const part of [screen.getByTestId('track'), ...screen.getAllByTestId('meter')]) {
      expect(part).toHaveAttribute('fill', `url(#${gradient?.id})`);
    }
  });

  it('fills each meter, holds it full, empties it and fills it back to where it stood', () => {
    const { container } = render(<Logo />);

    expect(container.querySelector('svg')).toHaveAttribute('data-moving', 'true');
    const [short, long] = [...container.querySelectorAll('animate[repeatCount="indefinite"]')];
    expect(short).toHaveAttribute('values', '13;22;22;0;13');
    expect(short).toHaveAttribute('keyTimes', '0;0.3565;0.4279;0.4851;1');
    expect(short).toHaveAttribute('dur', '7s');
    // The long leg's window is longer, so the two drift apart.
    expect(long).toHaveAttribute('values', '23;32;32;0;23');
    expect(long).toHaveAttribute('dur', '16s');
  });

  it('holds still when told to', () => {
    const { container } = render(<Logo animated={false} />);

    expect(container.querySelector('svg')).toHaveAttribute('data-moving', 'false');
    expect(container.querySelectorAll('animate')).toHaveLength(0);
  });

  it('holds still for a viewer who asked for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<Logo />);

    expect(container.querySelectorAll('animate')).toHaveLength(0);
  });
});
