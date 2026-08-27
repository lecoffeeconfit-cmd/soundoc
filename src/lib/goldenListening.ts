import type { SpeechPreferences, Voice } from '../types';

/**
 * Golden only contains controls that reach expo-speech or Soundoc's real
 * utterance queue. The current architecture does not expose synthesized PCM,
 * so EQ, dynamics, reverb, and stereo effects deliberately do not live here.
 */
export const GOLDEN_PRESET = {
  id: 'recommended',
  name: 'Golden — Recommended',
  description: 'Clear, calm, natural listening with room between ideas',
  rate: 0.9,
  pitch: 1,
  volume: 1,
  sentencePauseMs: 280,
  paragraphPauseMs: 650,
  headingPauseMs: 850,
  readingRules: {
    skipSiteBoilerplate: true,
    skipNavigationAndAds: true,
    skipCitations: true,
    skipLongNumbersAndCodes: true,
    skipDatabaseIdentifiers: true,
    skipUrls: true,
    skipConsecutiveDuplicates: true,
    skipReferenceSection: true,
    preserveHeadings: true,
    preserveMeaningfulNumbers: true,
    preserveStatistics: true,
    preserveMeasurements: true,
  },
} as const;

/** A clarity-first variation of Golden for dense, unfamiliar, or difficult material. */
export const CLEAR_MODE_PRESET = {
  id: 'clear',
  name: 'Clear Mode',
  description: 'The easiest-to-follow Golden sound: calm, natural, and extra clear',
  rate: 0.84,
  pitch: 1,
  volume: 1,
  sentencePauseMs: 360,
  paragraphPauseMs: 800,
  headingPauseMs: 1050,
  readingRules: {
    ...GOLDEN_PRESET.readingRules,
    preserveDefinitions: true,
    preserveMeaningfulNumbers: true,
    preserveStatistics: true,
    preserveMeasurements: true,
  },
} as const;

const normalizedLocale = (language: string) => language.trim().replace(/_/g, '-').toLowerCase();
const baseLanguage = (language: string) => normalizedLocale(language).split('-')[0];

function voiceQualityRank(voice: Voice) {
  if (/^enhanced$/i.test(voice.quality ?? '')) return 0;
  if (/enhanced|premium|neural|natural|wavenet/i.test(`${voice.name} ${voice.identifier}`)) return 1;
  if (/compact/i.test(`${voice.name} ${voice.identifier}`)) return 3;
  return 2;
}

/** Compatible voices only, ordered by locale, advertised quality, preference, and stability. */
export function rankAvailableVoices(voices: readonly Voice[], language: string, preferredIdentifier?: string): Voice[] {
  const target = normalizedLocale(language);
  const targetBase = baseLanguage(language);
  return voices
    .filter((voice) => baseLanguage(voice.language) === targetBase)
    .map((voice, inventoryIndex) => ({ voice, inventoryIndex }))
    .sort((a, b) => {
      const localeA = normalizedLocale(a.voice.language) === target ? 0 : 1;
      const localeB = normalizedLocale(b.voice.language) === target ? 0 : 1;
      if (localeA !== localeB) return localeA - localeB;
      const quality = voiceQualityRank(a.voice) - voiceQualityRank(b.voice);
      if (quality !== 0) return quality;
      const preferenceA = a.voice.identifier === preferredIdentifier ? 0 : 1;
      const preferenceB = b.voice.identifier === preferredIdentifier ? 0 : 1;
      if (preferenceA !== preferenceB) return preferenceA - preferenceB;
      return a.voice.name.localeCompare(b.voice.name) || a.inventoryIndex - b.inventoryIndex;
    })
    .map(({ voice }) => voice);
}

/** Returns undefined when no language-compatible installed voice exists so the OS can fall back safely. */
export function getBestGoldenVoice(voices: readonly Voice[], language: string, preferredIdentifier?: string): Voice | undefined {
  return rankAvailableVoices(voices, language, preferredIdentifier)[0];
}

/** All settings Golden owns. Keeping this centralized makes activation deterministic. */
export function applyGoldenPreset(options: { clearMode?: boolean } = {}): Partial<SpeechPreferences> {
  const preset = options.clearMode ? CLEAR_MODE_PRESET : GOLDEN_PRESET;
  return {
    modeId: 'recommended',
    presetId: 'recommended',
    recommendedListening: true,
    clearModeEnabled: options.clearMode === true,
    rate: preset.rate,
    pitch: preset.pitch,
    volume: preset.volume,
    sentencePauseMs: preset.sentencePauseMs,
    paragraphPauseMs: preset.paragraphPauseMs,
    headingPauseMs: preset.headingPauseMs,
    adaptiveListeningEnabled: false,
    podcastModeEnabled: false,
    smartFilteringEnabled: true,
    ...preset.readingRules,
  };
}

export function applyClearMode(): Partial<SpeechPreferences> {
  return applyGoldenPreset({ clearMode: true });
}

export function isGoldenPresetActive(preferences: Pick<SpeechPreferences, 'recommendedListening' | 'modeId'>) {
  return preferences.recommendedListening === true && (preferences.modeId === 'recommended' || preferences.modeId === 'smart');
}

/** A manual edit to any audible/structural Golden control turns the master preset off.
 * Voice is intentionally excluded: Golden adapts around a voice the user chose. */
export function isGoldenControlledChange(settings: Partial<SpeechPreferences>) {
  return [
    'rate', 'pitch', 'volume', 'sentencePauseMs', 'paragraphPauseMs', 'headingPauseMs',
    'clearModeEnabled',
    'adaptiveListeningEnabled', 'podcastModeEnabled', 'smartFilteringEnabled', 'skipUrls', 'skipCitations',
    'skipHeadings', 'skipConsecutiveDuplicates', 'skipLongNumbersAndCodes', 'skipReferenceSection',
    'skipSiteBoilerplate', 'skipNavigationAndAds', 'skipSharingControls', 'skipRelatedStories',
    'skipDatabaseIdentifiers',
  ].some((key) => Object.prototype.hasOwnProperty.call(settings, key));
}
