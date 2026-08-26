import assert from 'node:assert/strict';
// @ts-expect-error Node's type-strip runner loads the source file directly.
import * as notificationPreferences from './notificationPreferences.ts';

const { DEFAULT_NOTIFICATION_PREFERENCES, formatNotificationTime, normalizeNotificationPreferences } = notificationPreferences as typeof import('./notificationPreferences');

assert.deepEqual(
  DEFAULT_NOTIFICATION_PREFERENCES,
  {
    enabled: false,
    continueListeningEnabled: true,
    continueListeningTime: { hour: 20, minute: 0 },
    continueListeningCadence: 'daily',
    documentReadyEnabled: true,
    weeklyRecapEnabled: false,
    weeklyRecapWeekday: 1,
    weeklyRecapTime: { hour: 18, minute: 0 },
  },
  'defaults should be conservative'
);

assert.deepEqual(
  normalizeNotificationPreferences(undefined),
  DEFAULT_NOTIFICATION_PREFERENCES,
  'undefined input should normalize to defaults'
);

assert.deepEqual(
  normalizeNotificationPreferences({
    enabled: true,
    continueListeningEnabled: false,
    continueListeningTime: { hour: 25, minute: -9 },
    continueListeningCadence: 'weekdays',
    documentReadyEnabled: false,
    weeklyRecapEnabled: true,
    weeklyRecapWeekday: 9,
    weeklyRecapTime: { hour: 7.4, minute: 61.2 },
  }),
  {
    enabled: true,
    continueListeningEnabled: false,
    continueListeningTime: { hour: 23, minute: 0 },
    continueListeningCadence: 'weekdays',
    documentReadyEnabled: false,
    weeklyRecapEnabled: true,
    weeklyRecapWeekday: 1,
    weeklyRecapTime: { hour: 7, minute: 59 },
  },
  'malformed persisted values should normalize safely'
);

assert.deepEqual(
  normalizeNotificationPreferences({
    continueListeningTime: { hour: 8, minute: 5 },
    continueListeningCadence: 'daily',
    weeklyRecapWeekday: 5,
    weeklyRecapTime: { hour: 18, minute: 30 },
  }),
  {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    continueListeningTime: { hour: 8, minute: 5 },
    continueListeningCadence: 'daily',
    weeklyRecapWeekday: 5,
    weeklyRecapTime: { hour: 18, minute: 30 },
  },
  'valid times and cadence should survive normalization'
);

assert.equal(formatNotificationTime({ hour: 0, minute: 0 }), '12:00 AM', 'midnight should use a readable 12-hour label');
assert.equal(formatNotificationTime({ hour: 12, minute: 5 }), '12:05 PM', 'noon should use a readable 12-hour label');
assert.equal(formatNotificationTime({ hour: 20, minute: 0 }), '8:00 PM', 'evening times should be formatted for people, not clocks');

console.log('notification preference fixtures passed');
