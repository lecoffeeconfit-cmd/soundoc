import { getListeningModeProfile, LISTENING_MODE_PROFILES, normalizeListeningModeId, resolveSpeechPreferences } from './listeningModes';
import type { SpeechPreferences } from '../types';

const base: SpeechPreferences = { presetId: 'custom', modeId: 'custom', rate: 1, pitch: 1, volume: 1, sentencePauseMs: 300, paragraphPauseMs: 650, headingPauseMs: 850, pronunciationRules: [], skipHeadings: false, skipUrls: true, skipCitations: false, skipConsecutiveDuplicates: true, favoriteVoiceIds: [], recentVoiceIds: [], voiceIdentifier: 'com.apple.voice.compact.en-US.Samantha', recommendedListening: false };

export function runListeningModeFixtures() {
  const expected: Record<string, [number, number, number, number, number, number]> = {
    recommended: [0.96, 1, 0.97, 220, 520, 750], natural: [1, 1, 1, 220, 550, 750], study: [0.88, 1, 1, 380, 850, 1050], quickPreview: [1.55, 1, 1, 80, 220, 400], deepFocus: [0.92, 0.96, 0.95, 300, 700, 900], news: [1.1, 0.98, 1, 170, 430, 650], storytelling: [0.9, 0.96, 1, 360, 900, 1050], slowClear: [0.72, 1, 1, 520, 1100, 1300], relaxed: [0.84, 0.9, 0.88, 420, 950, 1100], sleep: [0.7, 0.84, 0.55, 600, 1350, 1500],
  };
  Object.entries(expected).forEach(([id, values]) => {
    const profile = getListeningModeProfile(id as keyof typeof expected);
    const actual = [profile.rate, profile.pitch, profile.volume, profile.sentencePauseMs, profile.paragraphPauseMs, profile.headingPauseMs];
    if (actual.some((value, index) => value !== values[index])) throw new Error(`${id} profile values changed`);
  });
  if (normalizeListeningModeId('studyFocus') !== 'study' || normalizeListeningModeId('sleepReading') !== 'sleep') throw new Error('legacy mode migration failed');
  const resolved = resolveSpeechPreferences({ ...base, modeId: 'study', voiceIdentifier: base.voiceIdentifier });
  if (resolved.rate !== 0.88 || resolved.voiceIdentifier !== base.voiceIdentifier || resolved.skipLongNumbersAndCodes !== true) throw new Error('mode resolution or voice preservation failed');
  const custom = resolveSpeechPreferences({ ...base, modeId: 'custom', rate: 1.23, pitch: 1.1, sentencePauseMs: 111 });
  if (custom.rate !== 1.23 || custom.pitch !== 1.1 || custom.sentencePauseMs !== 111 || custom.skipLongNumbersAndCodes !== true || custom.skipReferenceSection !== true) throw new Error('custom profile or default source cleanup was overwritten');
  const unfiltered = resolveSpeechPreferences({ ...base, modeId: 'custom', smartFilteringEnabled: false });
  if (unfiltered.skipLongNumbersAndCodes !== false || unfiltered.skipReferenceSection !== false || unfiltered.skipCitations !== false) throw new Error('source cleanup did not switch off');
  const restoredCustom = resolveSpeechPreferences({ ...base, modeId: 'custom', rate: 0.96, customProfile: { rate: 1.23, pitch: 1.1, volume: 0.9, sentencePauseMs: 111, paragraphPauseMs: 222 } });
  if (restoredCustom.rate !== 1.23 || restoredCustom.sentencePauseMs !== 111) throw new Error('saved custom profile was not restored');
  const migratedGolden = resolveSpeechPreferences({ ...base, modeId: 'recommended', recommendedListening: true, pitch: 0.7, volume: 1, sentencePauseMs: 900, podcastModeEnabled: true, adaptiveListeningEnabled: true });
  if (migratedGolden.pitch !== 1 || migratedGolden.volume !== 0.97 || migratedGolden.sentencePauseMs !== 220 || migratedGolden.podcastModeEnabled || migratedGolden.adaptiveListeningEnabled) throw new Error('Golden did not override incompatible saved tuning');
  if (LISTENING_MODE_PROFILES.find((profile) => profile.id === 'natural')?.rate !== 1) throw new Error('mode catalog was mutated');
  return { modes: Object.keys(expected).length, voice: resolved.voiceIdentifier };
}
