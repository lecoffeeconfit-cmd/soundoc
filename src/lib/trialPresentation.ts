const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function validTime(value: string | null | undefined) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

/** Friendly display text derived only from the authoritative trial expiration. */
export function formatTrialRemaining(expirationDate: string | null, fallbackDays: number | null, now = Date.now()) {
  const expiration = validTime(expirationDate);
  if (expiration !== undefined) {
    const remaining = expiration - now;
    if (remaining <= 0) return 'Ending soon';
    if (remaining < DAY_MS) {
      const hours = Math.max(1, Math.ceil(remaining / HOUR_MS));
      return `${hours} hr${hours === 1 ? '' : 's'} remaining`;
    }
    const days = Math.max(1, Math.ceil(remaining / DAY_MS));
    return `${days} day${days === 1 ? '' : 's'} remaining`;
  }
  if (fallbackDays === null || !Number.isFinite(fallbackDays) || fallbackDays <= 0) return 'Premium trial active';
  const days = Math.max(1, Math.round(fallbackDays));
  return `${days} day${days === 1 ? '' : 's'} remaining`;
}

/** Returns remaining trial fraction: 1 at the start and 0 at the authoritative end. */
export function trialRemainingProgress(startDate: string | null, expirationDate: string | null, now = Date.now()) {
  const start = validTime(startDate);
  const expiration = validTime(expirationDate);
  if (start === undefined || expiration === undefined || expiration <= start) return undefined;
  return Math.max(0, Math.min(1, (expiration - now) / (expiration - start)));
}

export function formatTrialEndDate(expirationDate: string | null) {
  const expiration = validTime(expirationDate);
  return expiration === undefined ? undefined : new Date(expiration).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
