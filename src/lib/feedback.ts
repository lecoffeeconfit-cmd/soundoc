import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import appConfig from '../../app.json';
export type FeedbackCategory = 'audio-voice' | 'document-pdf' | 'article-extraction' | 'playback-highlighting' | 'golden-mode' | 'feature-request' | 'account-subscription' | 'general';

export const FEEDBACK_RECIPIENT = 'coldsteelhowie@gmail.com';

export const FEEDBACK_CATEGORIES: Array<{ id: FeedbackCategory; label: string; detail: string; icon: string }> = [
  { id: 'general', label: 'Bug / Something Isn’t Working', detail: 'Something did not work as expected', icon: '!' },
  { id: 'audio-voice', label: 'Audio or Voice Issue', detail: 'Voice, pronunciation, or sound', icon: '◖' },
  { id: 'document-pdf', label: 'Document / PDF Import Issue', detail: 'Importing or preparing a document', icon: '▤' },
  { id: 'article-extraction', label: 'Website / Article Import Issue', detail: 'Reading a web article cleanly', icon: '↗' },
  { id: 'playback-highlighting', label: 'Playback Issue', detail: 'Controls, progress, or highlighting', icon: '▶' },
  { id: 'feature-request', label: 'Feature Request', detail: 'An idea for Soundoc', icon: '+' },
  { id: 'golden-mode', label: 'Design / Usability Feedback', detail: 'How Soundoc feels to use', icon: '✦' },
  { id: 'account-subscription', label: 'Other', detail: 'Anything else you would like to share', icon: '⌁' },
];

export const FEEDBACK_RATINGS = ['Great', 'Good', 'Okay', 'Needs Improvement'] as const;
export type FeedbackRating = typeof FEEDBACK_RATINGS[number];

const configured = appConfig.expo as typeof appConfig.expo & { android?: { versionCode?: number }; ios?: { buildNumber?: string } };
const configuredBuild = Platform.OS === 'android' ? String(configured.android?.versionCode ?? 1) : configured.ios?.buildNumber ?? '1';
export const APP_VERSION = Application.nativeApplicationVersion ?? appConfig.expo.version;
export const APP_BUILD = Application.nativeBuildVersion ?? configuredBuild;

export function feedbackCategoryLabel(category: FeedbackCategory) {
  return FEEDBACK_CATEGORIES.find((entry) => entry.id === category)?.label ?? 'Other';
}

export function buildFeedbackEmail({ category, message, rating, includeDiagnostics, openedFrom = 'Settings' }: { category: FeedbackCategory; message: string; rating?: FeedbackRating; includeDiagnostics: boolean; openedFrom?: string }) {
  const label = feedbackCategoryLabel(category);
  const lines = ['Soundoc Feedback', '', `Category: ${label}`];
  if (rating) lines.push(`Experience: ${rating}`);
  lines.push('', 'Feedback:', message.trim());
  if (includeDiagnostics) {
    const device = Device.modelName ?? Platform.select({ ios: 'iPhone or iPad', android: 'Android device', web: 'Web browser', default: 'Unknown device' });
    const osName = Device.osName ?? Platform.OS;
    const osVersion = Device.osVersion ?? String(Platform.Version);
    lines.push('', '-------------------------', 'Diagnostic Information', `App Version: ${APP_VERSION}`, `Build: ${APP_BUILD}`, `Platform: ${Platform.OS}`, `OS Version: ${osName} ${osVersion}`, `Device: ${device}${Device.isDevice ? '' : ' (simulator)'}`, `Opened from: ${openedFrom}`, `Submitted: ${new Date().toLocaleString()}`, `Environment: ${__DEV__ ? 'Development' : 'Production'}`, '-------------------------');
  }
  lines.push('', 'Sent from Soundoc');
  return { subject: `Soundoc Feedback – ${label}`, body: lines.join('\n') };
}
