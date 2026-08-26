import type { NotificationPermissionStatus, NotificationPlan, NotificationTriggerPlan } from '../types/notifications';

export type NotificationPermissionSnapshot = {
  granted: boolean;
  canAskAgain: boolean;
  iosStatus?: 'undetermined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral';
};

export type NativeNotificationTrigger =
  | { type: 'daily'; hour: number; minute: number; channelId: string }
  | { type: 'weekly'; weekday: number; hour: number; minute: number; channelId: string };

export function notificationPermissionStateFromSnapshot(snapshot: NotificationPermissionSnapshot) {
  let status: NotificationPermissionStatus;
  if (snapshot.granted && snapshot.iosStatus === 'provisional') status = 'provisional';
  else if (snapshot.granted) status = 'granted';
  else if (snapshot.iosStatus === 'denied' || !snapshot.canAskAgain) status = 'denied';
  else status = 'undetermined';
  return { status, canAskAgain: snapshot.canAskAgain, granted: snapshot.granted };
}

export function mapNotificationTrigger(trigger: NotificationTriggerPlan, channelId: string): NativeNotificationTrigger | null {
  if (trigger.kind === 'immediate') return null;
  if (trigger.kind === 'daily') return { type: 'daily', hour: trigger.hour, minute: trigger.minute, channelId };
  return { type: 'weekly', weekday: trigger.weekday, hour: trigger.hour, minute: trigger.minute, channelId };
}

export function buildScheduledNotificationData(plan: NotificationPlan): Record<string, unknown> {
  return { soundoc: true, planId: plan.id, ...(plan.data ?? { kind: plan.kind }) };
}
