import assert from 'node:assert/strict';
// @ts-expect-error Node's type-strip runner loads the source file directly.
import * as notificationPlanning from './notificationPlanning.ts';
import type { NotificationPreferences } from '../types/notifications';

const { buildNotificationPlans, continueListeningContent, documentReadyContent, findContinueListeningItem, notificationResponseTarget, weeklyRecapContent } = notificationPlanning as typeof import('./notificationPlanning');

type PlanningItem = Parameters<typeof findContinueListeningItem>[0][number];
type WeeklyAnalytics = Parameters<typeof weeklyRecapContent>[0];

const preferences: NotificationPreferences = {
  enabled: true,
  continueListeningEnabled: true,
  continueListeningTime: { hour: 20, minute: 0 },
  continueListeningCadence: 'daily',
  documentReadyEnabled: true,
  weeklyRecapEnabled: true,
  weeklyRecapWeekday: 1,
  weeklyRecapTime: { hour: 18, minute: 0 },
};

function makeItem(overrides: Partial<PlanningItem> & Pick<PlanningItem, 'id' | 'title'>): PlanningItem {
  const { id, title, ...rest } = overrides;
  return {
    id,
    title,
    completed: false,
    progress: 0,
    estimatedDurationSeconds: 1800,
    wordCount: 500,
    createdAt: 1000,
    updatedAt: 1000,
    ...rest,
  };
}

function makeWeeklyAnalytics(overrides: Partial<WeeklyAnalytics> = {}): WeeklyAnalytics {
  return {
    weeklyGoalMinutes: 60,
    updatedAt: '2026-08-25T12:00:00.000Z',
    ...overrides,
  };
}

const items = [
  makeItem({ id: 'finished', title: 'Finished item', completed: true, progress: 1, lastOpenedAt: 4000 }),
  makeItem({ id: 'no-progress', title: 'No progress item' }),
  makeItem({ id: 'older', title: 'Older article', progress: 0.25, lastOpenedAt: 5000, estimatedDurationSeconds: 3600, createdAt: 2000, updatedAt: 2000 }),
  makeItem({ id: 'newer', title: 'Newer article with a very long title that should be cleaned up for notification privacy because it is far too verbose for a phone banner', progress: 0.4, lastOpenedAt: 9000, estimatedDurationSeconds: 7200, createdAt: 3000, updatedAt: 3000 }),
] as const;

assert.equal(findContinueListeningItem(items)?.id, 'newer', 'the newest unfinished item should be chosen');

assert.equal(
  findContinueListeningItem([
    makeItem({ id: 'invalid', title: 'Invalid timestamp item', progress: 0.5, lastOpenedAt: Number.NaN, createdAt: 4000, updatedAt: 4000 }),
    makeItem({ id: 'valid', title: 'Valid timestamp item', progress: 0.4, lastOpenedAt: 8000, createdAt: 5000, updatedAt: 5000 }),
  ])?.id,
  'valid',
  'invalid lastOpenedAt values should not win the continue-listening selection'
);

assert.deepEqual(
  buildNotificationPlans({ ...preferences, enabled: false }, items, makeWeeklyAnalytics({ weekMinutesListened: 42 }), new Date('2026-08-25T12:00:00.000Z')),
  [],
  'disabled notifications should produce no plans'
);

assert.deepEqual(
  buildNotificationPlans({ ...preferences, weeklyRecapEnabled: false }, [makeItem({ id: 'finished', title: 'Finished item', completed: true, progress: 1, lastOpenedAt: 1000 })], makeWeeklyAnalytics({ weekMinutesListened: 42 }), new Date('2026-08-25T12:00:00.000Z')),
  [],
  'no eligible item should produce no continue listening plans'
);

const dailyPlans = buildNotificationPlans(preferences, items, makeWeeklyAnalytics({ weekMinutesListened: 42 }), new Date('2026-08-25T12:00:00.000Z'));
assert.equal(dailyPlans.length, 2, 'daily cadence plus weekly recap should produce two plan groups');
assert.equal(dailyPlans[0].trigger.kind, 'daily', 'continue listening should use a daily trigger');
assert.equal(dailyPlans[0].id, 'continue-listening:newer:daily', 'continue listening plan IDs should be stable');
assert.ok(dailyPlans[0].data && dailyPlans[0].data.kind === 'item', 'continue listening plans should include item data');
assert.equal(dailyPlans[0].data.itemId, 'newer', 'continue listening plans should include the item ID');
assert.match(dailyPlans[0].body, /minutes left/i, 'continue listening copy should mention remaining time');
assert.match(dailyPlans[0].body, /Newer article with a very long title/, 'continue listening copy should include a sanitized title');
assert.ok(dailyPlans[0].body.length <= 160, 'continue listening copy should stay bounded');

const weekdayPlans = buildNotificationPlans({ ...preferences, continueListeningCadence: 'weekdays' }, items, makeWeeklyAnalytics({ weekMinutesListened: 42 }), new Date('2026-08-25T12:00:00.000Z')).filter((plan) => plan.id.startsWith('continue-listening:'));
assert.deepEqual(
  weekdayPlans.map((plan) => plan.trigger),
  [
    { kind: 'weekly', weekday: 2, hour: 20, minute: 0 },
    { kind: 'weekly', weekday: 3, hour: 20, minute: 0 },
    { kind: 'weekly', weekday: 4, hour: 20, minute: 0 },
    { kind: 'weekly', weekday: 5, hour: 20, minute: 0 },
    { kind: 'weekly', weekday: 6, hour: 20, minute: 0 },
  ],
  'weekday cadence should create Monday through Friday plans'
);

assert.deepEqual(
  weeklyRecapContent(makeWeeklyAnalytics({ weekMinutesListened: 0 })),
  null,
  'weekly recap should require positive current-week minutes'
);

assert.equal(weeklyRecapContent(makeWeeklyAnalytics({ weekMinutesListened: 42 }))?.body, 'You listened for 42 minutes this week. Your library is ready when you are.', 'weekly recap copy should be calm and specific');

assert.equal(documentReadyContent(makeItem({ id: 'doc-1', title: 'Document title with “quotes” and whitespace   ' }))?.body, '“Document title with quotes and whitespace” is ready to listen.', 'document-ready copy should sanitize the title');

const notificationTarget = notificationResponseTarget({ kind: 'item', itemId: 'newer' });
assert.ok(notificationTarget, 'notification responses should resolve item targets');
assert.equal(notificationTarget.kind, 'item');
assert.equal(notificationTarget.itemId, 'newer', 'notification responses should preserve the item ID');

assert.equal(notificationResponseTarget({ kind: 'unknown' }), null, 'unknown notification response data should be ignored');

console.log('notification planning fixtures passed');
