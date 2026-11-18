import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Pool } from '@/lib/pools';
import { trafficFixture } from '@/test-utils/handlers';
import { at, NOW_MS } from '@/test-utils/time';
import { FleetBand } from './FleetBand';

const HOUR = 3_600_000;

const pools: Pool[] = [
  {
    provider: 'anthropic',
    limitId: 'anthropic:7d',
    label: '7 Day',
    seats: 8,
    used: 3.4,
    usedFraction: 0.42,
    severity: 'normal',
    nextReset: at(2 * HOUR),
    staggered: true,
  },
  {
    provider: 'openai-codex',
    limitId: 'codex:7d',
    label: '7 days',
    seats: 1,
    used: 0.22,
    usedFraction: 0.22,
    severity: 'normal',
    nextReset: at(45 * HOUR),
    staggered: false,
  },
  {
    provider: 'opencode-go',
    limitId: 'opencode:monthly',
    label: 'Monthly',
    seats: 1,
    used: 0.27,
    usedFraction: 0.27,
    severity: 'normal',
    nextReset: at(6 * 24 * HOUR),
    staggered: false,
  },
];

const meta = {
  title: 'Pages/Accounts/Components/FleetBand',
  component: FleetBand,
  args: { pools, traffic: trafficFixture, trafficStatus: 'success', monthlyUsd: 780, now: NOW_MS },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FleetBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem', { name: /7 Day|7 days|Monthly/ })).toHaveLength(3);
    await expect(canvas.getByRole('region', { name: 'Traffic' })).toBeVisible();
  },
};

/** No broker: the totals have the band to themselves, and nothing is said about traffic. */
export const WithoutBroker: Story = {
  args: { traffic: { ...trafficFixture, available: false } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('region', { name: 'Traffic' })).not.toBeInTheDocument();
  },
};

/** No account reports a window: the traffic has the band to itself. */
export const TrafficOnly: Story = {
  args: { pools: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('list', { name: 'Totals' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('region', { name: 'Traffic' })).toBeVisible();
  },
};

export const Loading: Story = {
  args: { traffic: undefined, trafficStatus: 'pending' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Loading the traffic…');
  },
};

export const Error: Story = {
  args: { traffic: undefined, trafficStatus: 'error' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Could not load the traffic.');
  },
};
