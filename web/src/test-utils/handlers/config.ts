import { http, HttpResponse } from 'msw';
import type { Config } from '@/api';

// The root route reads this through useConfig. In the app the page's
// injection supplies it; a page story or test that reads it mocks the request.
export const configFixture: Config = { name: 'oh-my-usage', version: '0.1.0', controls: true, pollIntervalSeconds: 60 };

/** MSW handlers for GET /api/v1/config: with a broker, and without one. */
export const configHandlers = {
  ok: http.get('/api/v1/config', () => HttpResponse.json(configFixture)),
  readOnly: http.get('/api/v1/config', () => HttpResponse.json({ ...configFixture, controls: false } satisfies Config)),
};
