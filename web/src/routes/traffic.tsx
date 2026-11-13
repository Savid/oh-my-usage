import { createFileRoute } from '@tanstack/react-router';
import { TrafficPage } from '@/pages/traffic/TrafficPage';

export const Route = createFileRoute('/traffic')({
  component: () => <TrafficPage />,
  head: () => ({ meta: [{ title: 'Traffic | oh-my-usage' }] }),
});
