export const FREE_WEEKLY_LISTENING_SECONDS = 60 * 60;
export const FREE_LISTENING_STORAGE_KEY = 'soundoc.free-listening.v1';
export const FREE_LISTENING_CHECKPOINT_MS = 15_000;
export const FREE_LOW_ALLOWANCE_SECONDS = 10 * 60;
export const FREE_CRITICAL_ALLOWANCE_SECONDS = 5 * 60;

export type FreeListeningUsage = {
  version: 1;
  periodStart: number;
  usedSeconds: number;
  lowAllowanceNoticeShown: boolean;
};

export type FreeListeningUpdate = {
  usage: FreeListeningUsage;
  remainingSeconds: number;
  reachedLimit: boolean;
  crossedLowAllowance: boolean;
  reset: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Monday at 00:00 in the listener's current local timezone. */
export function localWeekStart(now = Date.now()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

export function localWeekResetDate(now = Date.now()) {
  const reset = new Date(localWeekStart(now));
  reset.setDate(reset.getDate() + 7);
  return reset.getTime();
}

export function createFreeListeningUsage(now = Date.now()): FreeListeningUsage {
  return { version: 1, periodStart: localWeekStart(now), usedSeconds: 0, lowAllowanceNoticeShown: false };
}

export function validateFreeListeningUsage(value: unknown, now = Date.now()): FreeListeningUsage | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<FreeListeningUsage>;
  if (candidate.version !== 1) return null;
  const periodStart = finiteNumber(candidate.periodStart, Number.NaN);
  if (!Number.isFinite(periodStart)) return null;
  const expectedPeriodStart = localWeekStart(now);
  // A future period can only come from an invalid device clock or malformed storage.
  if (periodStart > expectedPeriodStart + DAY_MS) return null;
  return {
    version: 1,
    periodStart,
    usedSeconds: Math.max(0, Math.min(FREE_WEEKLY_LISTENING_SECONDS, finiteNumber(candidate.usedSeconds, 0))),
    lowAllowanceNoticeShown: candidate.lowAllowanceNoticeShown === true,
  };
}

export function normalizeFreeListeningUsage(value: FreeListeningUsage | null | undefined, now = Date.now()): FreeListeningUpdate {
  const currentPeriodStart = localWeekStart(now);
  const valid = validateFreeListeningUsage(value, now);
  if (!valid || valid.periodStart !== currentPeriodStart) {
    const usage = createFreeListeningUsage(now);
    return { usage, remainingSeconds: FREE_WEEKLY_LISTENING_SECONDS, reachedLimit: false, crossedLowAllowance: false, reset: valid ? valid.periodStart !== currentPeriodStart : false };
  }
  const remainingSeconds = Math.max(0, FREE_WEEKLY_LISTENING_SECONDS - valid.usedSeconds);
  return { usage: valid, remainingSeconds, reachedLimit: remainingSeconds <= 0, crossedLowAllowance: false, reset: false };
}

export function consumeFreeListeningUsage(value: FreeListeningUsage | null | undefined, elapsedSeconds: number, now = Date.now()): FreeListeningUpdate {
  const normalized = normalizeFreeListeningUsage(value, now);
  const elapsed = Math.max(0, finiteNumber(elapsedSeconds, 0));
  const before = normalized.remainingSeconds;
  const usedSeconds = Math.min(FREE_WEEKLY_LISTENING_SECONDS, normalized.usage.usedSeconds + elapsed);
  const remainingSeconds = Math.max(0, FREE_WEEKLY_LISTENING_SECONDS - usedSeconds);
  const crossedLowAllowance = before > FREE_LOW_ALLOWANCE_SECONDS
    && remainingSeconds <= FREE_LOW_ALLOWANCE_SECONDS
    && !normalized.usage.lowAllowanceNoticeShown;
  return {
    usage: { ...normalized.usage, usedSeconds, lowAllowanceNoticeShown: normalized.usage.lowAllowanceNoticeShown || crossedLowAllowance },
    remainingSeconds,
    reachedLimit: before > 0 && remainingSeconds <= 0,
    crossedLowAllowance,
    reset: normalized.reset,
  };
}

export function freeUsagePercent(value: FreeListeningUsage | null | undefined, now = Date.now()) {
  const { remainingSeconds } = normalizeFreeListeningUsage(value, now);
  return Math.max(0, Math.min(1, 1 - remainingSeconds / FREE_WEEKLY_LISTENING_SECONDS));
}

export function formatFreeListeningRemaining(seconds: number) {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  return `${minutes} min left`;
}

export function freeListeningResetLabel(now = Date.now()) {
  const reset = localWeekResetDate(now);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const resetDay = new Date(reset);
  resetDay.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((resetDay.getTime() - today.getTime()) / DAY_MS));
  if (days <= 1) return 'Resets tomorrow';
  if (days <= 3) return `Resets in ${days} days`;
  return 'Resets Monday';
}

export function runFreeListeningFixtures() {
  const monday = new Date(2026, 0, 5, 10, 0, 0).getTime();
  const created = createFreeListeningUsage(monday);
  if (created.periodStart !== new Date(2026, 0, 5).getTime() || created.usedSeconds !== 0) throw new Error('Free listening period did not start on Monday local midnight');
  const nearLimit = { ...created, usedSeconds: FREE_WEEKLY_LISTENING_SECONDS - 12 };
  const exhausted = consumeFreeListeningUsage(nearLimit, 20, monday + 1_000);
  if (exhausted.remainingSeconds !== 0 || !exhausted.reachedLimit) throw new Error('Free listening usage did not stop at the weekly limit');
  const followingMonday = new Date(2026, 0, 12, 8, 0, 0).getTime();
  const reset = normalizeFreeListeningUsage(exhausted.usage, followingMonday);
  if (!reset.reset || reset.remainingSeconds !== FREE_WEEKLY_LISTENING_SECONDS || reset.usage.usedSeconds !== 0) throw new Error('Free listening allowance did not reset cleanly for a new week');
  const low = consumeFreeListeningUsage(created, FREE_WEEKLY_LISTENING_SECONDS - FREE_LOW_ALLOWANCE_SECONDS, monday + 2_000);
  if (!low.crossedLowAllowance || !low.usage.lowAllowanceNoticeShown) throw new Error('Low allowance notice was not recorded once');
  if (validateFreeListeningUsage({ version: 1, periodStart: 'invalid', usedSeconds: 1 }, monday)) throw new Error('Invalid free listening storage was accepted');
  return { resetAt: localWeekResetDate(monday), remaining: exhausted.remainingSeconds };
}
