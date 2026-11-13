import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test-utils';
import { seatFixture, strayFixture } from '@/test-utils/handlers';
import { at, NOW_MS } from '@/test-utils/time';
import { SavedResets } from './SavedResets';

const DAY = 24 * 3_600_000;

describe('SavedResets', () => {
  it('lists each reset with what it clears, whether it can be spent and when it lapses', () => {
    render(<SavedResets resets={seatFixture.resets} limits={seatFixture.limits} now={NOW_MS} />);

    const panel = screen.getByRole('region', { name: 'Saved resets' });
    expect(panel).toHaveTextContent('2 held, 1 usable now');

    const resets = within(panel).getAllByRole('listitem');
    expect(resets).toHaveLength(2);
    // The limits are named as the page names them, not by their IDs.
    expect(resets[0]).toHaveTextContent(
      'One full limit reset (November 2026)usable nowClears 7 Day, 7 Day Fable · expires in 28d'
    );
    expect(within(resets[0]!).getByText('usable now')).toHaveAttribute('data-tone', 'ok');
    expect(resets[1]).toHaveTextContent(
      'New model launch: one Fable resetnot usable nowClears 7 Day Fable · expires in 117d'
    );
    expect(within(resets[1]!).getByText('not usable now')).toHaveAttribute('data-tone', 'neutral');
  });

  it('shows a reset the provider says little about', () => {
    render(<SavedResets resets={strayFixture.resets} limits={strayFixture.limits} now={NOW_MS} />);

    expect(screen.getByRole('region', { name: 'Saved resets' })).toHaveTextContent('1 held');
    // Codex does not say whether it can be spent, so no word on that.
    expect(screen.getByRole('listitem')).toHaveTextContent('A limit resetWhat it clears is not said · expires in 30d');
    expect(screen.queryByText(/usable now/)).not.toBeInTheDocument();
  });

  it('counts the resets the provider did not describe, and names a limit it does not report by its ID', () => {
    render(
      <SavedResets
        resets={{ available: 4, saved: [{ clears: ['anthropic:1h'] }, { clears: ['anthropic:1h'] }] }}
        limits={seatFixture.limits}
        now={NOW_MS}
      />
    );

    const resets = screen.getAllByRole('listitem');
    expect(resets).toHaveLength(2);
    expect(resets[0]).toHaveTextContent('A limit resetClears anthropic:1h · does not expire');
    expect(screen.getByText('And 2 more the provider did not describe.')).toBeInTheDocument();
  });

  it('says how many are held when none is described', () => {
    render(<SavedResets resets={{ available: 3, usable: 0, soonestExpiresAt: at(DAY) }} limits={[]} now={NOW_MS} />);

    expect(screen.getByRole('region', { name: 'Saved resets' })).toHaveTextContent('3 held, 0 usable now');
    expect(screen.getByText('3 the provider did not describe.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('says when the account holds none', () => {
    const { rerender } = render(<SavedResets resets={undefined} limits={[]} now={NOW_MS} />);

    expect(screen.getByText('This account holds no saved resets.')).toBeInTheDocument();

    rerender(<SavedResets resets={{ available: 0 }} limits={[]} now={NOW_MS} />);

    expect(screen.getByText('This account holds no saved resets.')).toBeInTheDocument();
    expect(screen.queryByText(/held/)).not.toBeInTheDocument();
  });
});
