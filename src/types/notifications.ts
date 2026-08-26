export type NotificationCadence = 'daily' | 'weekdays';
export type NotificationWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type NotificationPermissionStatus = 'undetermined' | 'denied' | 'provisional' | 'granted';

export type NotificationPermissionState = {
  status: NotificationPermissionStatus;
  canAskAgain: boolean;
  granted: boolean;
};

export type NotificationPreferences = {
  enabled: boolean;
  continueListeningEnabled: boolean;
  continueListeningTime: { hour: number; minute: number };
  continueListeningCadence: NotificationCadence;
  documentReadyEnabled: boolean;
  weeklyRecapEnabled: boolean;
  weeklyRecapWeekday: NotificationWeekday;
  weeklyRecapTime: { hour: number; minute: number };
};

export type NotificationResponseData = { kind: 'item'; itemId: string } | { kind: 'weekly-recap' } | { kind: 'document-ready'; itemId: string };
export type NotificationResponseTarget = { kind: 'item'; itemId: string } | { kind: 'weekly-recap' };

export type NotificationTriggerPlan = { kind: 'daily'; hour: number; minute: number } | { kind: 'weekly'; weekday: NotificationWeekday; hour: number; minute: number } | { kind: 'immediate' };

export type NotificationContent = {
  title: string;
  body: string;
  data?: NotificationResponseData;
};

export type NotificationPlanKind = 'continue-listening' | 'document-ready' | 'weekly-recap';

export type NotificationPlan = NotificationContent & {
  kind: NotificationPlanKind;
  id: string;
  trigger: NotificationTriggerPlan;
};
