import { cleanText, estimateSeconds } from './text';
import type { LibraryItem, ListeningAnalytics } from '../types/index';
import type { NotificationPreferences, NotificationPlan, NotificationResponseData, NotificationResponseTarget, NotificationTriggerPlan, NotificationWeekday } from '../types/notifications';

const MAX_TITLE_LENGTH = 52;
const MAX_BODY_LENGTH = 160;
const MINUTES_PER_HOUR = 60;
type PlanningItem = Pick<LibraryItem, 'id' | 'title' | 'progress' | 'completed' | 'completedAt' | 'lastOpenedAt' | 'estimatedDurationSeconds' | 'wordCount' | 'createdAt' | 'updatedAt'>;
type WeeklyAnalytics = Pick<ListeningAnalytics, 'updatedAt' | 'weeklyGoalMinutes'> & {
  weekMinutesListened?: number;
  weeklyMinutesListened?: number;
  currentWeekMinutes?: number;
};

function clampText(value: string, limit: number, stripQuotes = false) {
  const cleaned = cleanText(value);
  const collapsed = (stripQuotes ? cleaned.replace(/[“”]/g, '') : cleaned).replace(/\s+/g, ' ').trim();
  if (collapsed.length <= limit) return collapsed;
  return `${collapsed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function sanitizeTitle(value: string) {
  return clampText(value, MAX_TITLE_LENGTH, true);
}

function sanitizeBody(value: string) {
  return clampText(value, MAX_BODY_LENGTH);
}

function quoteTitle(value: string) {
  return `“${sanitizeTitle(value)}”`;
}

function isFinished(item: PlanningItem) {
  return item.completed === true || item.completedAt != null;
}

function normalizedLastOpenedAt(item: PlanningItem) {
  return Number.isFinite(item.lastOpenedAt) && (item.lastOpenedAt ?? 0) > 0 ? item.lastOpenedAt : undefined;
}

function hasMeaningfulProgress(item: PlanningItem) {
  return (Number.isFinite(item.progress) && item.progress > 0) || normalizedLastOpenedAt(item) !== undefined;
}

function remainingMinutes(item: PlanningItem) {
  const durationSeconds = Number.isFinite(item.estimatedDurationSeconds) && item.estimatedDurationSeconds! > 0
    ? item.estimatedDurationSeconds!
    : estimateSeconds(Number.isFinite(item.wordCount) ? item.wordCount : 0, 1);
  const progress = Number.isFinite(item.progress) ? Math.min(1, Math.max(0, item.progress)) : 0;
  return Math.max(1, Math.round((durationSeconds * Math.max(0, 1 - progress)) / MINUTES_PER_HOUR));
}

function continueListeningTarget(item: PlanningItem): NotificationResponseData {
  return { kind: 'item', itemId: item.id };
}

export function findContinueListeningItem(items: readonly PlanningItem[]) {
  return [...items]
    .filter((item) => !isFinished(item) && hasMeaningfulProgress(item))
    .sort((a, b) => (normalizedLastOpenedAt(b) ?? -1) - (normalizedLastOpenedAt(a) ?? -1) || (b.progress ?? 0) - (a.progress ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0))
    [0] ?? null;
}

export function continueListeningContent(item: PlanningItem) {
  const minutes = remainingMinutes(item);
  return {
    title: 'Continue listening',
    body: sanitizeBody(`You have ${minutes} minute${minutes === 1 ? '' : 's'} left in ${quoteTitle(item.title)}. Pick up where you left off.`),
    data: continueListeningTarget(item),
  };
}

export function documentReadyContent(item: PlanningItem) {
  return {
    title: 'Ready to listen',
    body: sanitizeBody(`${quoteTitle(item.title)} is ready to listen.`),
    data: { kind: 'document-ready', itemId: item.id } as const,
  };
}

function weeklyMinutes(analytics: WeeklyAnalytics) {
  const value = analytics.currentWeekMinutes ?? analytics.weekMinutesListened ?? analytics.weeklyMinutesListened ?? 0;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function weeklyRecapContent(analytics: WeeklyAnalytics) {
  const minutes = Math.round(weeklyMinutes(analytics));
  if (minutes <= 0) return null;
  return {
    title: 'Your week in Soundoc',
    body: sanitizeBody(`You listened for ${minutes} minute${minutes === 1 ? '' : 's'} this week. Your library is ready when you are.`),
  };
}

function continueListeningPlans(preferences: NotificationPreferences, item: PlanningItem): NotificationPlan[] {
  const content = continueListeningContent(item);
  if (preferences.continueListeningCadence === 'weekdays') {
    const weekdays: NotificationWeekday[] = [2, 3, 4, 5, 6];
    return weekdays.map((weekday) => ({
      kind: 'continue-listening',
      id: `continue-listening:${item.id}:weekday-${weekday}`,
      trigger: { kind: 'weekly', weekday, hour: preferences.continueListeningTime.hour, minute: preferences.continueListeningTime.minute },
      ...content,
    }));
  }
  return [{
    kind: 'continue-listening',
    id: `continue-listening:${item.id}:daily`,
    trigger: { kind: 'daily', hour: preferences.continueListeningTime.hour, minute: preferences.continueListeningTime.minute },
    ...content,
  }];
}

export function buildNotificationPlans(preferences: NotificationPreferences, items: readonly PlanningItem[], analytics: WeeklyAnalytics, _now: Date): NotificationPlan[] {
  if (!preferences.enabled) return [];
  const plans: NotificationPlan[] = [];
  const continueListeningItem = preferences.continueListeningEnabled ? findContinueListeningItem(items) : null;
  if (continueListeningItem) plans.push(...continueListeningPlans(preferences, continueListeningItem));
  const weeklyRecap = preferences.weeklyRecapEnabled ? weeklyRecapContent(analytics) : null;
  if (weeklyRecap) {
    plans.push({
      kind: 'weekly-recap',
      id: `weekly-recap:${preferences.weeklyRecapWeekday}:${preferences.weeklyRecapTime.hour}:${preferences.weeklyRecapTime.minute}`,
      trigger: { kind: 'weekly', weekday: preferences.weeklyRecapWeekday, hour: preferences.weeklyRecapTime.hour, minute: preferences.weeklyRecapTime.minute },
      ...weeklyRecap,
    });
  }
  return plans;
}

export function notificationResponseTarget(data: unknown): NotificationResponseTarget | null {
  if (typeof data !== 'object' || data === null) return null;
  const candidate = data as Partial<NotificationResponseData> & { itemId?: unknown };
  if (candidate.kind === 'item' && typeof candidate.itemId === 'string') return { kind: 'item', itemId: candidate.itemId };
  if (candidate.kind === 'document-ready' && typeof candidate.itemId === 'string') return { kind: 'item', itemId: candidate.itemId };
  return candidate.kind === 'weekly-recap' ? { kind: 'weekly-recap' } : null;
}
