import assert from 'node:assert/strict';
// @ts-expect-error Node's type-strip runner loads the source file directly.
import { currentWeekKey, normalizeAnalytics } from './analytics.ts';

const now = new Date(2026, 7, 25, 14, 30);
assert.equal(currentWeekKey(now), '2026-08-23', 'weeks should start on Sunday in the local timezone');

const normalized = normalizeAnalytics({
  minutesListened: 12,
  weeklyMinutesListened: 8,
  currentWeekStart: '2026-08-16',
  updatedAt: '2026-08-20T12:00:00.000Z',
});
assert.equal(normalized.weeklyMinutesListened, 0, 'a prior week should not leak into the current week');
assert.equal(normalized.currentWeekStart, currentWeekKey(), 'normalized analytics should use the current week key');

console.log('analytics fixtures passed');
