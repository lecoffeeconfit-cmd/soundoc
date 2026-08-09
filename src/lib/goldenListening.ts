import type { SpeechPreferences, Voice } from '../types';

/**
 * Golden only contains controls that reach expo-speech or Soundoc's real
 * utterance queue. The current architecture does not expose synthesized PCM,
 * so EQ, dynamics, reverb, and stereo effects deliberately do not live here.
 */
export const GOLDEN_PRESET = {
  id: 'recommended',
  name: 'Golden — Recommended',
  description: 'Optimized for clear, natural, podcast-style listening',
  rate: 0.96,
  pitch: 1,
  volume: 0.97,
  sentencePauseMs: 220,
  paragraphPauseMs: 520,
  headingPauseMs: 750,
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
export function applyGoldenPreset(): Partial<SpeechPreferences> {
  return {
    modeId: 'recommended',
    presetId: 'recommended',
    recommendedListening: true,
    rate: GOLDEN_PRESET.rate,
    pitch: GOLDEN_PRESET.pitch,
    volume: GOLDEN_PRESET.volume,
    sentencePauseMs: GOLDEN_PRESET.sentencePauseMs,
    paragraphPauseMs: GOLDEN_PRESET.paragraphPauseMs,
    headingPauseMs: GOLDEN_PRESET.headingPauseMs,
    adaptiveListeningEnabled: false,
    podcastModeEnabled: false,
    smartFilteringEnabled: true,
    ...GOLDEN_PRESET.readingRules,
  };
}

export function isGoldenPresetActive(preferences: Pick<SpeechPreferences, 'recommendedListening' | 'modeId'>) {
  return preferences.recommendedListening === true && (preferences.modeId === 'recommended' || preferences.modeId === 'smart');
}

/** A manual edit to any audible/structural Golden control turns the master preset off. */
export function isGoldenControlledChange(settings: Partial<SpeechPreferences>) {
  return [
    'voiceIdentifier', 'rate', 'pitch', 'volume', 'sentencePauseMs', 'paragraphPauseMs', 'headingPauseMs',
    'adaptiveListeningEnabled', 'podcastModeEnabled', 'smartFilteringEnabled', 'skipUrls', 'skipCitations',
    'skipHeadings', 'skipConsecutiveDuplicates', 'skipLongNumbersAndCodes', 'skipReferenceSection',
    'skipSiteBoilerplate', 'skipNavigationAndAds', 'skipSharingControls', 'skipRelatedStories',
    'skipDatabaseIdentifiers',
  ].some((key) => Object.prototype.hasOwnProperty.call(settings, key));
}
