import { ambienceSettingsForSelection, DEFAULT_AMBIENCE_VOLUME, listeningStudioAmbience, normalizeAmbienceType, studioSettingsFromPreferences } from './listeningStudio';
import type { SpeechPreferences } from '../types';

const base: SpeechPreferences = {
  presetId: 'custom', modeId: 'custom', rate: 1, pitch: 1, volume: 1,
  sentencePauseMs: 300, paragraphPauseMs: 650, headingPauseMs: 850,
  pronunciationRules: [], skipHeadings: false, skipUrls: true, skipCitations: false,
  skipConsecutiveDuplicates: true, favoriteVoiceIds: [], recentVoiceIds: [],
  voiceIdentifier: 'com.apple.voice.compact.en-US.Samantha', recommendedListening: false,
};

export function runListeningStudioFixtures() {
  if (listeningStudioAmbience.length !== 7 || listeningStudioAmbience[0].id !== 'none') throw new Error('ambience options changed');
  const selected = ambienceSettingsForSelection('rain', 0);
  if (selected.ambienceType !== 'rain' || selected.ambienceVolume !== DEFAULT_AMBIENCE_VOLUME) throw new Error('ambience selection did not restore a usable volume');
  const off = ambienceSettingsForSelection('none', 0.6);
  if (off.ambienceType !== 'none' || off.ambienceVolume !== 0) throw new Error('ambience did not turn off cleanly');
  const restored = studioSettingsFromPreferences({ ...base, ambienceType: 'fireplace', ambienceVolume: 1.4 });
  if (restored.ambienceType !== 'fireplace' || restored.ambienceVolume !== 1) throw new Error('ambience preferences were not normalized');
  if (normalizeAmbienceType('not-a-sound') !== 'none' || normalizeAmbienceType(undefined) !== 'none') throw new Error('invalid ambience preferences were not disabled');
  return { ambienceOptions: listeningStudioAmbience.length, defaultVolume: DEFAULT_AMBIENCE_VOLUME };
}
