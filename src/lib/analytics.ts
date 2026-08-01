import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ListeningAnalytics } from '../types';

const KEY = 'soundoc.analytics.v1';
const empty: ListeningAnalytics = { minutesListened: 0, wordsListened: 0, documentsCompleted: 0, summaryMinutes: 0, averageSpeed: 1, timeSavedSeconds: 0, weeklyGoalMinutes: 60, streakDays: 0, updatedAt: new Date(0).toISOString() };
export async function readAnalytics(): Promise<ListeningAnalytics> { try { const raw = await AsyncStorage.getItem(KEY); return raw ? { ...empty, ...JSON.parse(raw) } : empty; } catch { return empty; } }
async function write(next: ListeningAnalytics) { await AsyncStorage.setItem(KEY, JSON.stringify({ ...next, updatedAt: new Date().toISOString() })); }
let writeChain: Promise<void> = Promise.resolve();
export function recordListening(words: number, seconds: number, rate: number, summary = false) { writeChain = writeChain.then(async () => { const current = await readAnalytics(); const minutes = Math.max(0, seconds) / 60; const totalMinutes = current.minutesListened + (summary ? 0 : minutes); const totalWords = current.wordsListened + (summary ? 0 : Math.max(0, words)); const sessions = totalMinutes > 0 ? Math.max(1, Math.round(totalMinutes / 5)) : 1; await write({ ...current, minutesListened: totalMinutes, wordsListened: totalWords, summaryMinutes: current.summaryMinutes + (summary ? minutes : 0), averageSpeed: ((current.averageSpeed * Math.max(0, sessions - 1)) + rate) / sessions, timeSavedSeconds: current.timeSavedSeconds + (rate > 1 ? seconds * (1 - 1 / rate) : 0) }); }); return writeChain; }
export function recordCompletedDocument() { writeChain = writeChain.then(async () => { const current = await readAnalytics(); await write({ ...current, documentsCompleted: current.documentsCompleted + 1 }); }); return writeChain; }
export { KEY as ANALYTICS_STORAGE_KEY };
