import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test-utils';
import { Logo } from './Logo';

describe('Logo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws the face and its gauge, hidden from assistive technology', () => {
    const { container } = render(<Logo />);

    const logo = container.querySelector('svg');
    expect(logo).toHaveAttribute('aria-hidden', 'true');
    // The ring and its filled part, two eyes, a mouth.
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(container.querySelectorAll('ellipse')).toHaveLength(2);
    expect(container.querySelector('.stroke-meter')).toHaveAttribute('stroke-dasharray', '72 100');
  });

  it('fills its gauge and blinks', () => {
    const { container } = render(<Logo />);

    expect(container.querySelector('svg')).toHaveAttribute('data-moving', 'true');
    // The gauge, each eye and the mouth.
    expect(container.querySelectorAll('animate')).toHaveLength(4);
    expect(container.querySelectorAll('animate[repeatCount="indefinite"]')).toHaveLength(2);
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
