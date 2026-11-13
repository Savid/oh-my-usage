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

/** A length of time in letters, for tight spaces: "45s", "12m", "4h", "1d 8h", "5d". */
export function formatShort(ms: number): string {
  const seconds = Math.max(0, ms / 1000);
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;

  const hours = Math.round(seconds / 3600);
  if (hours < 24) return `${hours}h`;
  return hours % 24 === 0 ? `${hours / 24}d` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
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

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });

/** A count, in full up to four digits and shortened beyond: "1,834", "15.9K", "337M", "1.96B". */
export function formatCount(value: number): string {
  return Math.abs(value) < 10_000 ? grouped.format(value) : compact.format(value);
}

const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 3,
});

/** US dollars, as precise as the size calls for: "$0", "<$0.01", "$2.10", "$1,068", "$12.4K". */
export function formatUsd(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return '<$0.01';
  if (value < 100) return cents.format(value);
  if (value < 10_000) return dollars.format(value);
  return compactDollars.format(value);
}

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** A time of day in the viewer's time zone: "09:45". */
export function formatClock(ms: number): string {
  return clock.format(ms);
}

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' });

/** A day by its weekday and date, in the viewer's time zone: "Fri 13". */
export function formatDay(ms: number): string {
  return weekday.format(ms);
}

/** A part of a whole as a percent, never rounding a real part away: "<1%", "37%". */
export function formatShare(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return '0%';

  const share = part / whole;
  return share < 0.005 ? '<1%' : formatPercent(share);
}

/**
 * How fast a share is being used, per hour or, when that is under a point an
 * hour, per day: 0.021 an hour is "2.1%/h", 0.004 is "9.6%/day".
 */
export function formatPace(perHour: number): string {
  const points = perHour * 100;
  if (points === 0) return '0%/h';
  return points >= 1 ? `${points.toFixed(1)}%/h` : `${(points * 24).toFixed(1)}%/day`;
}
