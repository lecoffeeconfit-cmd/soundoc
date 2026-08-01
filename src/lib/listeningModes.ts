import type { LibraryItem, ListeningModeId, SmartClassification, SpeechPreferences } from '../types';

export type ListeningModeProfile = {
  id: ListeningModeId;
  name: string;
  description: string;
  icon: string;
  rate: number;
  pitch: number;
  volume: number;
  sentencePauseMs: number;
  paragraphPauseMs: number;
  readingRules?: Partial<Pick<SpeechPreferences, 'skipUrls' | 'skipCitations' | 'skipHeadings' | 'skipConsecutiveDuplicates'>>;
};

const profile = (value: Omit<ListeningModeProfile, 'icon'> & { icon?: string }): ListeningModeProfile => ({ icon: '◌', ...value });

export const LISTENING_MODE_PROFILES: readonly ListeningModeProfile[] = [
  profile({ id: 'smart', name: 'Smart', description: 'Automatically adjusts pacing and reading rules for the current content.', rate: 1, pitch: 1, volume: 1, sentencePauseMs: 300, paragraphPauseMs: 650, icon: '✦' }),
  profile({ id: 'natural', name: 'Natural', description: 'Balanced for everyday articles and documents.', rate: 1, pitch: 1, volume: 1, sentencePauseMs: 250, paragraphPauseMs: 600, icon: '◉' }),
  profile({ id: 'storyteller', name: 'Storyteller', description: 'A relaxed pace for stories, biographies, and long-form reading.', rate: 0.92, pitch: 0.96, volume: 1, sentencePauseMs: 400, paragraphPauseMs: 900, icon: '⌁' }),
  profile({ id: 'studyFocus', name: 'Study Focus', description: 'Deliberate pacing for research, textbooks, and learning material.', rate: 0.95, pitch: 1, volume: 1, sentencePauseMs: 350, paragraphPauseMs: 750, readingRules: { skipUrls: true, skipCitations: true, skipConsecutiveDuplicates: true }, icon: '▤' }),
  profile({ id: 'fastScan', name: 'Fast Scan', description: 'Quickly review long articles and documents.', rate: 1.5, pitch: 1, volume: 1, sentencePauseMs: 100, paragraphPauseMs: 250, readingRules: { skipUrls: true, skipCitations: true, skipConsecutiveDuplicates: true }, icon: '»' }),
  profile({ id: 'sleepReading', name: 'Sleep Reading', description: 'A quiet, gentle pace for bedtime listening.', rate: 0.72, pitch: 0.82, volume: 0.55, sentencePauseMs: 600, paragraphPauseMs: 1300, readingRules: { skipUrls: true, skipCitations: true }, icon: '☾' }),
  profile({ id: 'deepNarrator', name: 'Deep Narrator', description: 'A deeper, slower presentation for serious long-form content.', rate: 0.88, pitch: 0.78, volume: 1, sentencePauseMs: 350, paragraphPauseMs: 800, icon: '◒' }),
  profile({ id: 'newsreader', name: 'Newsreader', description: 'A steady, efficient pace for news and informational articles.', rate: 1.1, pitch: 0.98, volume: 1, sentencePauseMs: 180, paragraphPauseMs: 450, icon: '▥' }),
  profile({ id: 'slowClear', name: 'Slow & Clear', description: 'Slower speech and longer pauses for difficult material.', rate: 0.75, pitch: 0.95, volume: 1, sentencePauseMs: 500, paragraphPauseMs: 1000, icon: '◐' }),
  profile({ id: 'relaxed', name: 'Relaxed', description: 'Comfortable pacing for casual listening.', rate: 0.85, pitch: 0.88, volume: 0.9, sentencePauseMs: 450, paragraphPauseMs: 950, icon: '≈' }),
  profile({ id: 'highClarity', name: 'High Clarity', description: 'Maximum intelligibility with deliberate pacing.', rate: 0.82, pitch: 1.03, volume: 1, sentencePauseMs: 450, paragraphPauseMs: 900, readingRules: { skipUrls: true, skipCitations: true, skipConsecutiveDuplicates: true }, icon: '⊙' }),
];

export const CUSTOM_MODE_PROFILE: ListeningModeProfile = profile({ id: 'custom', name: 'Custom', description: 'Your own saved combination of speed, pitch, pauses, and reading rules.', rate: 1, pitch: 1, volume: 1, sentencePauseMs: 300, paragraphPauseMs: 650, icon: '⚙' });

export function getListeningModeProfile(id: ListeningModeId, preferences?: SpeechPreferences): ListeningModeProfile {
  if (id === 'custom') return preferences ? { ...CUSTOM_MODE_PROFILE, rate: preferences.rate, pitch: preferences.pitch, volume: preferences.volume, sentencePauseMs: preferences.sentencePauseMs, paragraphPauseMs: preferences.paragraphPauseMs, readingRules: rulesFromPreferences(preferences) } : CUSTOM_MODE_PROFILE;
  return LISTENING_MODE_PROFILES.find((entry) => entry.id === id) ?? LISTENING_MODE_PROFILES[1];
}

function rulesFromPreferences(preferences: SpeechPreferences) { return { skipUrls: preferences.skipUrls, skipCitations: preferences.skipCitations, skipHeadings: preferences.skipHeadings, skipConsecutiveDuplicates: preferences.skipConsecutiveDuplicates }; }

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

export function smartProfileFor(item?: Pick<LibraryItem, 'type' | 'title' | 'text' | 'source' | 'wordCount'> | null): ListeningModeProfile & { classification: SmartClassification } {
  const classification = classifyDocument(item);
  const modeId: ListeningModeId = classification === 'scientific' || classification === 'technical' ? 'deepNarrator' : classification === 'educational' ? 'studyFocus' : classification === 'news' ? 'newsreader' : classification === 'story' ? 'storyteller' : classification === 'legal' ? 'slowClear' : 'natural';
  return { ...getListeningModeProfile(modeId), classification };
}

export function resolveSpeechPreferences(preferences: SpeechPreferences, item?: LibraryItem | null): SpeechPreferences {
  if (preferences.modeId !== 'smart') return preferences;
  const resolved = smartProfileFor(item);
  return { ...preferences, smartClassification: resolved.classification, rate: resolved.rate, pitch: resolved.pitch, volume: resolved.volume, sentencePauseMs: resolved.sentencePauseMs, paragraphPauseMs: resolved.paragraphPauseMs, ...resolved.readingRules };
}

export function modeSummary(preferences: SpeechPreferences, item?: LibraryItem | null) {
  if (preferences.modeId === 'smart') return `Smart · ${classificationLabel(preferences.smartClassification ?? smartProfileFor(item).classification)}`;
  return getListeningModeProfile(preferences.modeId, preferences).name;
}

export function classificationLabel(classification: SmartClassification) { return classification === 'shortForm' ? 'Short form' : classification.charAt(0).toUpperCase() + classification.slice(1); }
