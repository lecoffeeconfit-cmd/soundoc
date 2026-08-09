import { modeProfileFor } from './listeningModes';
import type { ListeningModeId, SpeechPreferences } from '../types';

export type ListeningStudioPresetId = 'podcast' | 'study' | 'quick-preview' | 'deep-focus' | 'relaxed' | 'custom';
export type AmbienceType = 'none' | 'rain' | 'cafe' | 'brown-noise' | 'white-noise' | 'fireplace' | 'nature';

export type ListeningStudioSettings = {
  enabled: boolean;
  preset: ListeningStudioPresetId;
  ambienceType: AmbienceType;
  ambienceVolume: number;
};

export const defaultListeningStudioSettings: ListeningStudioSettings = {
  enabled: false,
  preset: 'custom',
  ambienceType: 'none',
  ambienceVolume: 0,
};

const presetModes: Record<Exclude<ListeningStudioPresetId, 'custom'>, ListeningModeId> = {
  podcast: 'recommended',
  study: 'study',
  'quick-preview': 'quickPreview',
  'deep-focus': 'deepFocus',
  relaxed: 'relaxed',
};

export const listeningStudioPresets: Array<{ id: ListeningStudioPresetId; label: string; icon: string }> = [
  { id: 'podcast', label: 'Podcast', icon: '◉' },
  { id: 'study', label: 'Study', icon: '▤' },
  { id: 'quick-preview', label: 'Quick Preview', icon: '»' },
  { id: 'deep-focus', label: 'Deep Focus', icon: '◒' },
  { id: 'relaxed', label: 'Relaxed', icon: '≈' },
  { id: 'custom', label: 'Custom', icon: '⌘' },
];

export function studioSettingsFromPreferences(preferences: SpeechPreferences): ListeningStudioSettings {
  const preset = preferences.listeningStudioPreset;
  return {
    enabled: preferences.listeningStudioEnabled === true,
    preset: preset ?? (preferences.modeId === 'custom' ? 'custom' : 'podcast'),
    ambienceType: preferences.ambienceType ?? 'none',
    ambienceVolume: typeof preferences.ambienceVolume === 'number' ? Math.max(0, Math.min(1, preferences.ambienceVolume)) : 0,
  };
}

export function speechSettingsForStudioPreset(preset: Exclude<ListeningStudioPresetId, 'custom'>): Partial<SpeechPreferences> {
  const modeId = presetModes[preset];
  const profile = modeProfileFor(modeId);
  return {
    modeId,
    presetId: modeId,
    recommendedListening: modeId === 'recommended',
    listeningStudioPreset: preset,
    rate: profile.rate,
    pitch: profile.pitch,
    volume: profile.volume,
    sentencePauseMs: profile.sentencePauseMs,
    paragraphPauseMs: profile.paragraphPauseMs,
    headingPauseMs: profile.headingPauseMs,
  };
}

export function pauseLevelFromPreferences(preferences: SpeechPreferences) {
  const sentence = (Math.max(0, preferences.sentencePauseMs - 50) / 650) * 0.5;
  const paragraph = (Math.max(0, preferences.paragraphPauseMs - 100) / 1800) * 0.5;
  return Math.max(0, Math.min(100, Math.round((sentence + paragraph) * 100)));
}

export function speechSettingsForPauseLevel(level: number): Pick<SpeechPreferences, 'sentencePauseMs' | 'paragraphPauseMs'> {
  const normalized = Math.max(0, Math.min(100, level)) / 100;
  return {
    sentencePauseMs: Math.round((50 + normalized * 650) / 10) * 10,
    paragraphPauseMs: Math.round((100 + normalized * 1800) / 10) * 10,
  };
}
