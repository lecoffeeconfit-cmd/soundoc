import type { NotificationPreferences, NotificationWeekday } from '../types/notifications';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readCadence(value: unknown) {
  return value === 'daily' || value === 'weekdays' ? value : DEFAULT_NOTIFICATION_PREFERENCES.continueListeningCadence;
}

function readWeekday(value: unknown, fallback: NotificationWeekday): NotificationWeekday {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6 || value === 7 ? value : fallback;
}

function readTime(value: unknown, fallback: { hour: number; minute: number }) {
  if (!isPlainObject(value)) return { ...fallback };
  const hour = Number.isFinite(Number(value.hour)) ? clamp(Math.round(Number(value.hour)), 0, 23) : fallback.hour;
  const minute = Number.isFinite(Number(value.minute)) ? clamp(Math.round(Number(value.minute)), 0, 59) : fallback.minute;
  return { hour, minute };
}

function cloneDefaults(): NotificationPreferences {
  return {
    enabled: DEFAULT_NOTIFICATION_PREFERENCES.enabled,
    continueListeningEnabled: DEFAULT_NOTIFICATION_PREFERENCES.continueListeningEnabled,
    continueListeningTime: { ...DEFAULT_NOTIFICATION_PREFERENCES.continueListeningTime },
    continueListeningCadence: DEFAULT_NOTIFICATION_PREFERENCES.continueListeningCadence,
    documentReadyEnabled: DEFAULT_NOTIFICATION_PREFERENCES.documentReadyEnabled,
    weeklyRecapEnabled: DEFAULT_NOTIFICATION_PREFERENCES.weeklyRecapEnabled,
    weeklyRecapWeekday: DEFAULT_NOTIFICATION_PREFERENCES.weeklyRecapWeekday,
    weeklyRecapTime: { ...DEFAULT_NOTIFICATION_PREFERENCES.weeklyRecapTime },
  };
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  continueListeningEnabled: true,
  continueListeningTime: { hour: 20, minute: 0 },
  continueListeningCadence: 'daily',
  documentReadyEnabled: true,
  weeklyRecapEnabled: false,
  weeklyRecapWeekday: 1,
  weeklyRecapTime: { hour: 18, minute: 0 },
};

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  if (!isPlainObject(value)) return cloneDefaults();
  return {
    enabled: readBoolean(value.enabled, DEFAULT_NOTIFICATION_PREFERENCES.enabled),
    continueListeningEnabled: readBoolean(value.continueListeningEnabled, DEFAULT_NOTIFICATION_PREFERENCES.continueListeningEnabled),
    continueListeningTime: readTime(value.continueListeningTime, DEFAULT_NOTIFICATION_PREFERENCES.continueListeningTime),
    continueListeningCadence: readCadence(value.continueListeningCadence),
    documentReadyEnabled: readBoolean(value.documentReadyEnabled, DEFAULT_NOTIFICATION_PREFERENCES.documentReadyEnabled),
    weeklyRecapEnabled: readBoolean(value.weeklyRecapEnabled, DEFAULT_NOTIFICATION_PREFERENCES.weeklyRecapEnabled),
    weeklyRecapWeekday: readWeekday(value.weeklyRecapWeekday, DEFAULT_NOTIFICATION_PREFERENCES.weeklyRecapWeekday),
    weeklyRecapTime: readTime(value.weeklyRecapTime, DEFAULT_NOTIFICATION_PREFERENCES.weeklyRecapTime),
  };
}

function formatHour(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  const clockHour = normalized % 12 || 12;
  return clockHour;
}

function formatPeriod(hour: number) {
  return ((hour % 24) + 24) % 24 < 12 ? 'AM' : 'PM';
}

export function formatNotificationTime(time: { hour: number; minute: number }) {
  const hour = clamp(Math.round(Number(time.hour)), 0, 23);
  const minute = clamp(Math.round(Number(time.minute)), 0, 59);
  return `${formatHour(hour)}:${minute.toString().padStart(2, '0')} ${formatPeriod(hour)}`;
}
