import assert from 'node:assert/strict';
import type { NotificationPlan } from '../types/notifications.ts';
// @ts-expect-error Node's type-strip runner loads the source file directly.
import { buildScheduledNotificationData, mapNotificationTrigger, notificationPermissionStateFromSnapshot } from './notificationServiceLogic.ts';

const dailyPlan: NotificationPlan = {
  kind: 'continue-listening',
  id: 'continue-listening:doc-1:daily',
  title: 'Continue listening',
  body: 'You have 12 minutes left in “Notes”. Pick up where you left off.',
  data: { kind: 'item', itemId: 'doc-1' },
  trigger: { kind: 'daily', hour: 20, minute: 0 },
};

assert.deepEqual(
  mapNotificationTrigger(dailyPlan.trigger, 'soundoc-reading'),
  { type: 'daily', hour: 20, minute: 0, channelId: 'soundoc-reading' },
  'daily plans should map to a quiet daily trigger'
);

assert.deepEqual(
  mapNotificationTrigger({ kind: 'weekly', weekday: 2, hour: 20, minute: 0 }, 'soundoc-reading'),
  { type: 'weekly', weekday: 2, hour: 20, minute: 0, channelId: 'soundoc-reading' },
  'weekly plans should preserve the weekday and time'
);

assert.equal(mapNotificationTrigger({ kind: 'immediate' }, 'soundoc-reading'), null, 'immediate plans should use a null trigger');

assert.deepEqual(
  buildScheduledNotificationData(dailyPlan),
  { soundoc: true, planId: dailyPlan.id, kind: 'item', itemId: 'doc-1' },
  'scheduled data should carry a stable Soundoc marker and response target'
);

assert.equal(notificationPermissionStateFromSnapshot({ granted: false, canAskAgain: true, iosStatus: 'undetermined' }).status, 'undetermined');
assert.equal(notificationPermissionStateFromSnapshot({ granted: false, canAskAgain: false, iosStatus: 'denied' }).status, 'denied');
assert.equal(notificationPermissionStateFromSnapshot({ granted: true, canAskAgain: false, iosStatus: 'provisional' }).status, 'provisional');
assert.equal(notificationPermissionStateFromSnapshot({ granted: true, canAskAgain: false, iosStatus: 'authorized' }).status, 'granted');

console.log('notification service logic fixtures passed');
