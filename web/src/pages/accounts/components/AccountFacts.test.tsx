import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test-utils';
import { keyFixture, pausedSeatFixture, seatFixture, strayFixture } from '@/test-utils/handlers';
import { at, NOW_MS } from '@/test-utils/time';
import { AccountFacts } from './AccountFacts';

const HOUR = 3_600_000;

/** Each fact as "name: value". */
function facts(): string[] {
  return screen.getAllByRole('term').map(term => `${term.textContent}: ${term.nextElementSibling?.textContent}`);
}

describe('AccountFacts', () => {
  it('says an account is taking traffic and what it is', () => {
    render(<AccountFacts account={seatFixture} now={NOW_MS} />);

    expect(screen.getByRole('region', { name: 'Status' })).toBeInTheDocument();
    expect(facts()).toEqual([
      'Traffic: activeomp may send it traffic.',
      'Provider: Anthropic',
      'Login: OAuth login',
      'Organisation: One Org',
      'Usage read: 12s ago',
    ]);
    expect(screen.getByText('active')).toHaveAttribute('data-tone', 'ok');
  });

  it("puts a pause before omp's own blocks, and lists those", () => {
    render(<AccountFacts account={pausedSeatFixture} now={NOW_MS} />);

    expect(screen.getByText('paused')).toHaveAttribute('data-tone', 'warn');
    expect(facts()[0]).toBe('Traffic: pausedomp uses it last, when every other account is blocked or spent.');
    expect(facts()[1]).toMatch(/^Blocks: anthropic:5h until \d{2}:\d{2}, in 2h$/);
  });

  it('says an account is blocked, naming a block on everything, and drops blocks that have ended', () => {
    const blocked = {
      ...seatFixture,
      blocks: [
        { scope: '', until: at(3 * HOUR) },
        { scope: 'tier:fable', until: at(HOUR) },
        { scope: 'auth', until: at(-60_000) },
      ],
    };
    render(<AccountFacts account={blocked} now={NOW_MS} />);

    expect(screen.getByText('blocked')).toHaveAttribute('data-tone', 'danger');
    const blocks = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent(/^everything until \d{2}:\d{2}, in 3h$/);
    expect(blocks[1]).toHaveTextContent(/^tier:fable until \d{2}:\d{2}, in 60m$/);
  });

  it('says when the broker does not hold the account, and gives its plan', () => {
    render(<AccountFacts account={strayFixture} now={NOW_MS} />);

    expect(facts()).toEqual([
      'Traffic: activeomp may send it traffic.',
      'Provider: OpenAI Codex',
      'Login: Not held by the broker, so it cannot be paused.',
      'Plan: pro',
      'Usage read: 2m ago',
    ]);
  });

  it('says when no usage was ever reported, and when what was is old', () => {
    const { rerender } = render(<AccountFacts account={keyFixture} now={NOW_MS} />);

    expect(facts()).toContain('Login: API key');
    expect(facts()).toContain('Usage read: The provider has reported no usage.');

    rerender(<AccountFacts account={{ ...seatFixture, fetchedAt: at(-2 * HOUR) }} now={NOW_MS} />);

    expect(screen.getByText('2h ago: the figures above are that old.')).toHaveClass('text-warn');
  });
});
