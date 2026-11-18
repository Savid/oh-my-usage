import type { JSX } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { isMetric, type Metric } from '@/lib/metrics';
import { TrafficPage } from '@/pages/traffic/TrafficPage';

function Traffic(): JSX.Element {
  const { metric } = Route.useSearch();
  const navigate = Route.useNavigate();

  return <TrafficPage metric={metric} onMetric={next => void navigate({ search: { metric: next }, replace: true })} />;
}

export const Route = createFileRoute('/traffic')({
  // What the charts show travels in the link, so the homepage's choice opens here.
  validateSearch: (search: Record<string, unknown>): { metric?: Metric } =>
    isMetric(search.metric) ? { metric: search.metric } : {},
  component: Traffic,
  head: () => ({ meta: [{ title: 'Traffic | oh-my-usage' }] }),
});
