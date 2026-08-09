import type { LibraryItem, ListeningModeId, SmartClassification, SpeechPreferences } from '../types';
import { GOLDEN_PRESET } from './goldenListening';

/** The mode catalog is the single source of truth for values shown in Settings and used by speech. */
export type ListeningModeProfile = {
  id: Exclude<ListeningModeId, 'smart' | 'studyFocus' | 'fastScan' | 'deepNarrator' | 'newsreader' | 'storyteller' | 'sleepReading' | 'highClarity'>;
  name: string;
  description: string;
  useLabel: string;
  icon: string;
  rate: number;
  pitch: number;
  volume: number;
  sentencePauseMs: number;
  paragraphPauseMs: number;
  headingPauseMs: number;
  readingRules: Partial<Pick<SpeechPreferences, 'skipSiteBoilerplate' | 'skipNavigationAndAds' | 'skipSharingControls' | 'skipRelatedStories' | 'skipDatabaseIdentifiers' | 'skipUrls' | 'skipCitations' | 'skipHeadings' | 'skipConsecutiveDuplicates' | 'skipLongNumbersAndCodes' | 'skipReferenceSection' | 'preserveHeadings' | 'preserveDefinitions' | 'preserveMeaningfulNumbers' | 'preserveStatistics' | 'preserveMeasurements' | 'preserveDialogue' | 'preserveDatesAndStatistics'>>;
};

const defaultModeRules: ListeningModeProfile['readingRules'] = { skipSiteBoilerplate: false, skipNavigationAndAds: false, skipSharingControls: false, skipRelatedStories: false, skipDatabaseIdentifiers: false, skipUrls: false, skipCitations: false, skipHeadings: false, skipConsecutiveDuplicates: true, skipLongNumbersAndCodes: false, skipReferenceSection: false, preserveHeadings: true };
const profile = (value: Omit<ListeningModeProfile, 'icon'> & { icon?: string }): ListeningModeProfile => ({ icon: '◌', ...value, readingRules: value.id === 'custom' ? (value.readingRules ?? {}) : { ...defaultModeRules, ...value.readingRules } });

export const LISTENING_MODE_PROFILES: readonly ListeningModeProfile[] = [
  profile({ id: 'recommended', name: GOLDEN_PRESET.name, description: GOLDEN_PRESET.description, useLabel: 'Best overall', icon: '✦', rate: GOLDEN_PRESET.rate, pitch: GOLDEN_PRESET.pitch, volume: GOLDEN_PRESET.volume, sentencePauseMs: GOLDEN_PRESET.sentencePauseMs, paragraphPauseMs: GOLDEN_PRESET.paragraphPauseMs, headingPauseMs: GOLDEN_PRESET.headingPauseMs, readingRules: { ...GOLDEN_PRESET.readingRules } }),
  profile({ id: 'natural', name: 'Natural', description: 'Balanced everyday listening with minimal processing.', useLabel: 'Everyday', icon: '◉', rate: 1, pitch: 1, volume: 1, sentencePauseMs: 220, paragraphPauseMs: 550, headingPauseMs: 750, readingRules: { skipSiteBoilerplate: true, skipNavigationAndAds: true, skipUrls: true, skipConsecutiveDuplicates: true, preserveHeadings: true } }),
  profile({ id: 'study', name: 'Study & Learn', description: 'Deliberate pacing for textbooks, research, and material you want to remember.', useLabel: 'Learning', icon: '▤', rate: 0.88, pitch: 1, volume: 1, sentencePauseMs: 380, paragraphPauseMs: 850, headingPauseMs: 1050, readingRules: { skipSiteBoilerplate: true, skipNavigationAndAds: true, skipCitations: true, skipLongNumbersAndCodes: true, skipDatabaseIdentifiers: true, skipUrls: true, skipConsecutiveDuplicates: true, skipReferenceSection: true, preserveHeadings: true, preserveDefinitions: true, preserveStatistics: true, preserveMeasurements: true, preserveMeaningfulNumbers: true } }),
  profile({ id: 'quickPreview', name: 'Quick Preview', description: 'Rapidly scan an article or document before deciding whether to read it fully.', useLabel: 'Previewing', icon: '»', rate: 1.55, pitch: 1, volume: 1, sentencePauseMs: 80, paragraphPauseMs: 220, headingPauseMs: 400, readingRules: { skipSiteBoilerplate: true, skipNavigationAndAds: true, skipCitations: true, skipLongNumbersAndCodes: true, skipDatabaseIdentifiers: true, skipUrls: true, skipConsecutiveDuplicates: true, skipReferenceSection: true, preserveHeadings: true } }),
  profile({ id: 'deepFocus', name: 'Deep Focus', description: 'Steady, distraction-free listening for long work or study sessions.', useLabel: 'Long sessions', icon: '◒', rate: 0.92, pitch: 0.96, volume: 0.95, sentencePauseMs: 300, paragraphPauseMs: 700, headingPauseMs: 900, readingRules: { skipSiteBoilerplate: true, skipNavigationAndAds: true, skipCitations: true, skipLongNumbersAndCodes: true, skipUrls: true, skipConsecutiveDuplicates: true, skipReferenceSection: true, preserveHeadings: true } }),
  profile({ id: 'news', name: 'News & Articles', description: 'A clear, efficient newsreader pace for articles and current information.', useLabel: 'News', icon: '▥', rate: 1.1, pitch: 0.98, volume: 1, sentencePauseMs: 170, paragraphPauseMs: 430, headingPauseMs: 650, readingRules: { skipSiteBoilerplate: true, skipNavigationAndAds: true, skipSharingControls: true, skipRelatedStories: true, skipCitations: true, skipLongNumbersAndCodes: true, skipUrls: true, skipConsecutiveDuplicates: true, preserveHeadings: true, preserveDatesAndStatistics: true } }),
  profile({ id: 'storytelling', name: 'Storytelling', description: 'A relaxed pace for fiction, biographies, essays, and narrative content.', useLabel: 'Stories', icon: '⌁', rate: 0.9, pitch: 0.96, volume: 1, sentencePauseMs: 360, paragraphPauseMs: 900, headingPauseMs: 1050, readingRules: { skipSiteBoilerplate: true, skipNavigationAndAds: true, skipUrls: true, skipConsecutiveDuplicates: false, skipCitations: false, skipReferenceSection: false, preserveHeadings: true, preserveDialogue: true } }),
  profile({ id: 'slowClear', name: 'Slow & Clear', description: 'Maximum intelligibility for difficult material or slower listening.', useLabel: 'Accessibility', icon: '◐', rate: 0.72, pitch: 1, volume: 1, sentencePauseMs: 520, paragraphPauseMs: 1100, headingPauseMs: 1300, readingRules: { skipSiteBoilerplate: true, skipNavigationAndAds: true, skipCitations: true, skipLongNumbersAndCodes: true, skipUrls: true, skipConsecutiveDuplicates: true, preserveHeadings: true, preserveMeaningfulNumbers: true } }),
  profile({ id: 'relaxed', name: 'Relaxed', description: 'Comfortable casual listening with softer pacing.', useLabel: 'Casual', icon: '≈', rate: 0.84, pitch: 0.9, volume: 0.88, sentencePauseMs: 420, paragraphPauseMs: 950, headingPauseMs: 1100, readingRules: { skipSiteBoilerplate: true, skipNavigationAndAds: true, skipCitations: true, skipLongNumbersAndCodes: true, skipUrls: true, skipConsecutiveDuplicates: true, skipReferenceSection: true, preserveHeadings: true } }),
  profile({ id: 'sleep', name: 'Sleep', description: 'A quiet, gentle pace for bedtime listening.', useLabel: 'Bedtime', icon: '☾', rate: 0.7, pitch: 0.84, volume: 0.55, sentencePauseMs: 600, paragraphPauseMs: 1350, headingPauseMs: 1500, readingRules: { skipSiteBoilerplate: true, skipNavigationAndAds: true, skipCitations: true, skipLongNumbersAndCodes: true, skipDatabaseIdentifiers: true, skipUrls: true, skipConsecutiveDuplicates: true, skipReferenceSection: true, preserveHeadings: true } }),
];

export const CUSTOM_MODE_PROFILE: ListeningModeProfile = profile({ id: 'custom', name: 'Custom', description: 'Your manually selected listening settings.', useLabel: 'Your settings', icon: '⚙', rate: 1, pitch: 1, volume: 1, sentencePauseMs: 300, paragraphPauseMs: 650, headingPauseMs: 850, readingRules: {} });

/** Maps IDs written by older Soundoc versions to the current catalog. */
export function normalizeListeningModeId(id?: ListeningModeId | string): ListeningModeId {
  switch (id) {
    case 'smart': return 'recommended';
    case 'studyFocus': return 'study';
    case 'fastScan': return 'quickPreview';
    case 'deepNarrator': return 'deepFocus';
    case 'newsreader': return 'news';
    case 'storyteller': return 'storytelling';
    case 'sleepReading': return 'sleep';
    case 'highClarity': return 'slowClear';
    case 'recommended': case 'natural': case 'study': case 'quickPreview': case 'deepFocus': case 'news': case 'storytelling': case 'slowClear': case 'relaxed': case 'sleep': case 'custom': return id;
    default: return 'recommended';
  }
}

export function modeProfileFor(id: ListeningModeId | string | undefined, preferences?: SpeechPreferences): ListeningModeProfile {
  const normalized = normalizeListeningModeId(id);
  if (normalized === 'custom') {
    const source = preferences?.customProfile ?? preferences;
    return { ...CUSTOM_MODE_PROFILE, rate: source?.rate ?? CUSTOM_MODE_PROFILE.rate, pitch: source?.pitch ?? CUSTOM_MODE_PROFILE.pitch, volume: source?.volume ?? CUSTOM_MODE_PROFILE.volume, sentencePauseMs: source?.sentencePauseMs ?? CUSTOM_MODE_PROFILE.sentencePauseMs, paragraphPauseMs: source?.paragraphPauseMs ?? CUSTOM_MODE_PROFILE.paragraphPauseMs, headingPauseMs: source?.headingPauseMs ?? CUSTOM_MODE_PROFILE.headingPauseMs, readingRules: source ? rulesFromPreferences(source) : {} };
  }
  return LISTENING_MODE_PROFILES.find((entry) => entry.id === normalized) ?? LISTENING_MODE_PROFILES[0];
}

export const getListeningModeProfile = modeProfileFor;

function rulesFromPreferences(preferences: Partial<Pick<SpeechPreferences, 'skipSiteBoilerplate' | 'skipNavigationAndAds' | 'skipSharingControls' | 'skipRelatedStories' | 'skipDatabaseIdentifiers' | 'skipUrls' | 'skipCitations' | 'skipHeadings' | 'skipConsecutiveDuplicates' | 'skipLongNumbersAndCodes' | 'skipReferenceSection' | 'preserveHeadings' | 'preserveDefinitions' | 'preserveMeaningfulNumbers' | 'preserveStatistics' | 'preserveMeasurements' | 'preserveDialogue' | 'preserveDatesAndStatistics'>>): ListeningModeProfile['readingRules'] {
  return { skipSiteBoilerplate: preferences.skipSiteBoilerplate, skipNavigationAndAds: preferences.skipNavigationAndAds, skipSharingControls: preferences.skipSharingControls, skipRelatedStories: preferences.skipRelatedStories, skipDatabaseIdentifiers: preferences.skipDatabaseIdentifiers, skipUrls: preferences.skipUrls, skipCitations: preferences.skipCitations, skipHeadings: preferences.skipHeadings, skipConsecutiveDuplicates: preferences.skipConsecutiveDuplicates, skipLongNumbersAndCodes: preferences.skipLongNumbersAndCodes, skipReferenceSection: preferences.skipReferenceSection, preserveHeadings: preferences.preserveHeadings, preserveDefinitions: preferences.preserveDefinitions, preserveMeaningfulNumbers: preferences.preserveMeaningfulNumbers, preserveStatistics: preferences.preserveStatistics, preserveMeasurements: preferences.preserveMeasurements, preserveDialogue: preferences.preserveDialogue, preserveDatesAndStatistics: preferences.preserveDatesAndStatistics };
}

export function recommendedProfileFor(item?: Pick<LibraryItem, 'type' | 'title' | 'text' | 'source' | 'wordCount'> | null): ListeningModeProfile & { classification: SmartClassification } {
  return { ...modeProfileFor('recommended'), classification: classifyDocument(item) };
}

export function classifyDocument(item?: Pick<LibraryItem, 'type' | 'title' | 'text' | 'source' | 'wordCount'> | null): SmartClassification {
  if (!item || !item.text?.trim()) return 'general';
  const text = `${item.title} ${item.source ?? ''} ${item.text}`.toLowerCase();
  const words = item.wordCount || item.text.trim().split(/\s+/).length;
  if (words < 180) return 'shortForm';
  if (/abstract|methods?|results?|discussion|doi\b|pmid\b|references|journal|research paper|ncbi|pubmed/.test(text) || /\[[0-9]{1,3}\]/.test(text)) return 'scientific';
  if (/api reference|developer guide|documentation|technical guide|sdk|getting started|installation|configuration|programming/.test(text)) return 'technical';
  if (/lesson|chapter|learning objectives?|study guide|textbook|definition|exercise|course material/.test(text)) return 'educational';
  if (/agreement|terms and conditions|statute|regulation|legal notice|policy|whereas|hereby/.test(text)) return 'legal';
  if (/by [a-z][a-z .'-]{2,30}\b|breaking news|reported today|newsletter|press release/.test(text) || /news|times|post|reuters|bbc|npr/.test(item.source?.toLowerCase() ?? '')) return 'news';
  if (/chapter\s+[0-9ivx]+|once upon a time|novel|fiction|biography|memoir|prologue|epilogue/.test(text) || (words > 1000 && !/[\[\]]/.test(text))) return 'story';
  return 'general';
}

/** Legacy Smart remains available to callers, but resolves to the fixed Recommended profile. */
export function smartProfileFor(item?: Pick<LibraryItem, 'type' | 'title' | 'text' | 'source' | 'wordCount'> | null) {
  return { ...modeProfileFor('recommended'), classification: classifyDocument(item) };
}

export function resolveSpeechPreferences(preferences: SpeechPreferences, item?: LibraryItem | null): SpeechPreferences {
  const id = preferences.recommendedListening ? 'recommended' : normalizeListeningModeId(preferences.modeId);
  const resolved = modeProfileFor(id, preferences);
  const golden = id === 'recommended';
  const podcastPacing = !golden && preferences.podcastModeEnabled ? { sentencePauseMs: Math.max(resolved.sentencePauseMs, 280), paragraphPauseMs: Math.max(resolved.paragraphPauseMs, 700), headingPauseMs: Math.max(resolved.headingPauseMs, 900) } : {};
  const filtering = preferences.smartFilteringEnabled === false
    ? { skipSiteBoilerplate: false, skipNavigationAndAds: false, skipSharingControls: false, skipRelatedStories: false, skipDatabaseIdentifiers: false, skipUrls: false, skipCitations: false, skipHeadings: false, skipConsecutiveDuplicates: false, skipLongNumbersAndCodes: false, skipReferenceSection: false }
    : { ...resolved.readingRules, skipSiteBoilerplate: true, skipUrls: true, skipCitations: true, skipLongNumbersAndCodes: true, skipReferenceSection: true };
  return { ...preferences, modeId: id, smartClassification: golden ? classifyDocument(item) : preferences.smartClassification, rate: resolved.rate, pitch: resolved.pitch, volume: resolved.volume, sentencePauseMs: podcastPacing.sentencePauseMs ?? resolved.sentencePauseMs, paragraphPauseMs: podcastPacing.paragraphPauseMs ?? resolved.paragraphPauseMs, headingPauseMs: podcastPacing.headingPauseMs ?? resolved.headingPauseMs, ...filtering, recommendedListening: golden, podcastModeEnabled: golden ? false : preferences.podcastModeEnabled, adaptiveListeningEnabled: golden ? false : preferences.adaptiveListeningEnabled };
}

export function modeSummary(preferences: SpeechPreferences, item?: LibraryItem | null) {
  if (preferences.podcastModeEnabled) return 'Podcast';
  const id = preferences.recommendedListening ? 'recommended' : normalizeListeningModeId(preferences.modeId);
  return modeProfileFor(id, preferences).name;
}

export function classificationLabel(classification: SmartClassification) { return classification === 'shortForm' ? 'Short form' : classification.charAt(0).toUpperCase() + classification.slice(1); }
