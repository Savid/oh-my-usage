/** The one frozen instant every fixture and story is built against. */
const NOW = '2026-09-26T12:00:00.000Z';

/** `NOW` in milliseconds, for `now` props and `Date.now()` stand-ins. */
export const NOW_MS = Date.parse(NOW);

/** `NOW` shifted by `ms`, for fixtures that need "a while ago" or "later". */
export function at(ms: number): string {
  return new Date(NOW_MS + ms).toISOString();
}

/**
 * Holds `Date.now()` at `ms` (`NOW_MS` unless given) until the function it
 * returns is called, so a page that reads the clock agrees with fixtures
 * built against `NOW_MS`. For a story's `beforeEach`.
 */
export function freezeClock(ms = NOW_MS): () => void {
  const real = Date.now;
  Date.now = () => ms;
  return () => {
    Date.now = real;
  };
}
