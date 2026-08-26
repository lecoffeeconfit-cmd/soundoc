import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { buildNotificationPlans, documentReadyContent, notificationResponseTarget } from './notificationPlanning';
import { normalizeNotificationPreferences } from './notificationPreferences';
import { buildScheduledNotificationData, mapNotificationTrigger, notificationPermissionStateFromSnapshot } from './notificationServiceLogic';
import type { ListeningAnalytics, LibraryItem } from '../types';
import type { NotificationPermissionState, NotificationPlan, NotificationPreferences, NotificationResponseTarget } from '../types/notifications';

export const NOTIFICATION_PREFERENCES_STORAGE_KEY = 'soundoc.notifications.v1';
export const SOUNDoc_NOTIFICATION_CHANNEL_ID = 'soundoc-reading';
const SOUNDoc_NOTIFICATION_COLOR = '#FF7138';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: AppState.currentState !== 'active',
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function readNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_PREFERENCES_STORAGE_KEY);
    return normalizeNotificationPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeNotificationPreferences(null);
  }
}

export async function writeNotificationPreferences(value: NotificationPreferences) {
  await AsyncStorage.setItem(NOTIFICATION_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeNotificationPreferences(value)));
}

function iosPermissionStatus(status: Notifications.NotificationPermissionsStatus['ios']): 'undetermined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral' | undefined {
  if (!status) return undefined;
  switch (status.status) {
    case Notifications.IosAuthorizationStatus.NOT_DETERMINED: return 'undetermined';
    case Notifications.IosAuthorizationStatus.DENIED: return 'denied';
    case Notifications.IosAuthorizationStatus.AUTHORIZED: return 'authorized';
    case Notifications.IosAuthorizationStatus.PROVISIONAL: return 'provisional';
    case Notifications.IosAuthorizationStatus.EPHEMERAL: return 'ephemeral';
    default: return undefined;
  }
}

function permissionStateFromExpoStatus(status: Notifications.NotificationPermissionsStatus): NotificationPermissionState {
  return notificationPermissionStateFromSnapshot({
    granted: status.granted,
    canAskAgain: status.canAskAgain,
    iosStatus: iosPermissionStatus(status.ios),
  });
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  try {
    return permissionStateFromExpoStatus(await Notifications.getPermissionsAsync());
  } catch {
    return { status: 'denied', canAskAgain: false, granted: false };
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  try {
    const status = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false, allowProvisional: false },
    });
    return permissionStateFromExpoStatus(status);
  } catch {
    return { status: 'denied', canAskAgain: false, granted: false };
  }
}

export async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(SOUNDoc_NOTIFICATION_CHANNEL_ID, {
    name: 'Reading reminders',
    description: 'Quiet, helpful reminders from your Soundoc library',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: [0],
    showBadge: false,
    enableVibrate: false,
    enableLights: false,
    lightColor: SOUNDoc_NOTIFICATION_COLOR,
  });
}

function notificationContent(plan: NotificationPlan): Notifications.NotificationContentInput {
  return {
    title: plan.title,
    body: plan.body,
    data: buildScheduledNotificationData(plan),
    sound: false,
    badge: 0,
    interruptionLevel: 'passive',
    ...(Platform.OS === 'android' ? {
      channelId: SOUNDoc_NOTIFICATION_CHANNEL_ID,
      color: SOUNDoc_NOTIFICATION_COLOR,
      priority: Notifications.AndroidNotificationPriority.LOW,
    } : {}),
  };
}

function expoTrigger(plan: NotificationPlan): Notifications.NotificationTriggerInput {
  const mapped = mapNotificationTrigger(plan.trigger, SOUNDoc_NOTIFICATION_CHANNEL_ID);
  if (!mapped) return null;
  if (mapped.type === 'daily') {
    return { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: mapped.hour, minute: mapped.minute, channelId: mapped.channelId };
  }
  return { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: mapped.weekday, hour: mapped.hour, minute: mapped.minute, channelId: mapped.channelId };
}

function isSoundocRequest(request: Notifications.NotificationRequest) {
  return request.content.data?.soundoc === true;
}

function requestPlanId(request: Notifications.NotificationRequest) {
  const planId = request.content.data?.planId;
  return typeof planId === 'string' ? planId : null;
}

function requestMatchesPlan(request: Notifications.NotificationRequest, plan: NotificationPlan) {
  return requestPlanId(request) === plan.id && request.content.title === plan.title && request.content.body === plan.body;
}

async function scheduledSoundocRequests() {
  return (await Notifications.getAllScheduledNotificationsAsync()).filter(isSoundocRequest);
}

async function schedulePlan(plan: NotificationPlan) {
  await Notifications.scheduleNotificationAsync({
    identifier: plan.id,
    content: notificationContent(plan),
    trigger: expoTrigger(plan),
  });
}

export async function syncScheduledNotifications(
  preferences: NotificationPreferences,
  items: readonly LibraryItem[],
  analytics: ListeningAnalytics | null | undefined,
  permission: NotificationPermissionState,
) {
  const existing = await scheduledSoundocRequests();
  if (!permission.granted || !preferences.enabled) {
    await Promise.all(existing.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
    return;
  }

  await setupNotificationChannel();
  const plans = buildNotificationPlans(preferences, items, analytics ?? { updatedAt: '', weeklyGoalMinutes: 60, weeklyMinutesListened: 0 }, new Date());
  const desiredIds = new Set(plans.map((plan) => plan.id));
  await Promise.all(existing.filter((request) => !desiredIds.has(requestPlanId(request) ?? '')).map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
  for (const plan of plans) {
    const match = existing.find((request) => requestPlanId(request) === plan.id);
    if (match && requestMatchesPlan(match, plan)) continue;
    if (match) await Notifications.cancelScheduledNotificationAsync(match.identifier);
    await schedulePlan(plan);
  }
}

export async function scheduleDocumentReadyNotification(item: LibraryItem, permission: NotificationPermissionState) {
  if (!permission.granted) return;
  await setupNotificationChannel();
  const content = documentReadyContent(item);
  const plan: NotificationPlan = {
    kind: 'document-ready',
    id: `document-ready:${item.id}`,
    trigger: { kind: 'immediate' },
    ...content,
  };
  const existing = await scheduledSoundocRequests();
  const match = existing.find((request) => requestPlanId(request) === plan.id);
  if (match) return;
  await schedulePlan(plan);
}

export function installNotificationResponseListener(onTarget: (target: NotificationResponseTarget) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const target = notificationResponseTarget(response.notification.request.content.data);
    if (target) onTarget(target);
  });
  return () => subscription.remove();
}

export async function getLastNotificationResponseTarget(): Promise<NotificationResponseTarget | null> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return notificationResponseTarget(response?.notification.request.content.data);
  } catch {
    return null;
  }
}

