/** A length of time in its largest fitting unit: "0.3 s", "12 s", "4 min", "3 h", "5 d". */
function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms / 1000);
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  if (seconds < 120) return `${Math.round(seconds)} s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86_400)} d`;
}

/** How long ago an ISO timestamp was, relative to `now` in milliseconds: "0.3 s", "12 s", "4 min". */
export function formatAge(iso: string, now: number): string {
  return formatDuration(now - Date.parse(iso));
}

/** How long until an ISO timestamp, relative to `now` in milliseconds; "0.0 s" once it has passed. */
export function formatUntil(iso: string, now: number): string {
  return formatDuration(Date.parse(iso) - now);
}

/** A share as a whole percent: 0.756 is "76%". Overage stays above 100%. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** A moment in the viewer's time zone: "13 Nov, 09:45". */
export function formatDateTime(ms: number): string {
  return dateTime.format(ms);
}
