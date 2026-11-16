import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { Account, UsageTrend } from '@/api';
import { AccountRow } from '@/pages/accounts/components/AccountRow';
import { pausedSeatFixture, seatFixture, strayFixture, trendsFixture } from '@/test-utils/handlers';
import { at, NOW_MS } from '@/test-utils/time';

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

const meta = {
  title: 'Foundations/Principles',
  tags: ['!autodocs', '!dev'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// A seat climbing fast enough to run out two days before its week resets.
const racing: Account = {
  ...strayFixture,
  id: '0000000000000ee1',
  email: 'racing@example.com',
  limits: [{ id: 'codex:7d', label: '7 days', usedFraction: 0.5, resetsAt: at(50 * HOUR), windowSeconds: 7 * 86_400 }],
};
const racingTrend: UsageTrend = {
  accountId: racing.id,
  limitId: 'codex:7d',
  points: [
    { at: at(-10 * HOUR), usedFraction: 0.3 },
    { at: at(-HOUR), usedFraction: 0.48 },
  ],
};

function Rows({ accounts }: { accounts: Account[] }): JSX.Element {
  return (
    <section
      aria-label="Example rows"
      className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface"
    >
      {accounts.map(account => (
        <AccountRow
          key={account.id}
          account={account}
          trends={[...trendsFixture.trends, racingTrend]}
          start={NOW_MS - WEEK}
          now={NOW_MS}
          controls
        />
      ))}
    </section>
  );
}

/**
 * Three answers at a glance: how much each account has used (the big figure
 * over its week), whether it can take work now (its state and its session
 * window), and, only when it is coming, trouble.
 */
export const Glance: Story = {
  render: () => <Rows accounts={[seatFixture, racing, pausedSeatFixture]} />,
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement).getAllByRole('article');
    await expect(rows).toHaveLength(3);
    await expect(rows[1]).toHaveTextContent('runs dry in');
  },
};

/** A calm account says so by saying little: no colour, no marks, no forecast. */
export const Calm: Story = {
  render: () => (
    <Rows
      accounts={[
        {
          ...strayFixture,
          id: '0000000000000ca1',
          email: 'calm@example.com',
          limits: [{ ...strayFixture.limits[0]!, usedFraction: 0.31 }],
          resets: undefined,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole('article');
    await expect(row).toHaveAttribute('data-severity', 'normal');
    await expect(row).not.toHaveTextContent('▲');
  },
};
