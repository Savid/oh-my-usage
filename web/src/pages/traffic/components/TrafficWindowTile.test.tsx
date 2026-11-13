import { describe, expect, it } from 'vitest';
import type { TrafficWindow } from '@/api';
import { render, screen, within } from '@/test-utils';
import { quietTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { TrafficWindowTile } from './TrafficWindowTile';

const day = trafficFixture.windows[1]!;

describe('TrafficWindowTile', () => {
  it('shows a period in total and how its cost divides between providers', () => {
    const { container } = render(<TrafficWindowTile window={day} />);

    const tile = screen.getByRole('article', { name: '24 hours' });
    expect(tile).toHaveTextContent('24 hoursat API prices$1,0688,607 req · 1.61B tok');

    const lines = within(tile).getAllByRole('listitem');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveTextContent('Anthropic8,501 req$1,064100%');
    // A real part is never rounded away to nothing.
    expect(lines[2]).toHaveTextContent('OpenCode Go38 req$0.04<1%');

    // The share bar: its ground, then a part per provider in its colour.
    const parts = container.querySelectorAll('svg[viewBox="0 0 100 1"] rect');
    expect(parts).toHaveLength(4);
    expect(parts[1]).toHaveClass('fill-anthropic');
    expect(parts[2]).toHaveClass('fill-openai');
  });

  it('says when nothing passed', () => {
    const { container } = render(<TrafficWindowTile window={quietTrafficFixture.windows[0]!} />);

    expect(screen.getByRole('article', { name: 'Last hour' })).toHaveTextContent('$00 req · 0 tok');
    expect(screen.getByText('Nothing passed.')).toBeInTheDocument();
    expect(container.querySelectorAll('svg[viewBox="0 0 100 1"] rect')).toHaveLength(1);
  });

  it('sums the providers beyond the first four into one line', () => {
    const many: TrafficWindow = {
      ...day,
      providers: ['anthropic', 'openai-codex', 'opencode-go', 'openrouter', 'xai', 'kimi-code'].map(provider => ({
        provider,
        counts: { ...day.total, requests: 10, costUsd: 2 },
      })),
    };
    render(<TrafficWindowTile window={many} />);

    const lines = screen.getAllByRole('listitem');
    expect(lines).toHaveLength(5);
    expect(lines[4]).toHaveTextContent('2 more providers$4.00');
  });
});
