import { applyGoldenPreset, getBestGoldenVoice, GOLDEN_PRESET, isGoldenControlledChange, rankAvailableVoices } from './goldenListening';
import { resolveRuntimeSpeechPreferences } from './listeningModes';
import { applyGoldenPersonalization, createGoldenAdaptiveProfile, recordGoldenFeedback, startGoldenExperiment, undoLastGoldenAdjustment, validateGoldenAdaptiveProfile } from './goldenPersonalization';
import { processSpeechText } from './speechText';
import type { LibraryItem, SpeechPreferences, Voice } from '../types';

const voices: Voice[] = [
  { identifier: 'fr-enhanced', name: 'French Premium', language: 'fr-FR', quality: 'Enhanced' },
  { identifier: 'en-compact', name: 'English Compact', language: 'en-US', quality: 'Default' },
  { identifier: 'en-enhanced', name: 'English Enhanced', language: 'en-US', quality: 'Enhanced' },
  { identifier: 'en-gb-enhanced', name: 'British Enhanced', language: 'en-GB', quality: 'Enhanced' },
];

const goldenPreferences: SpeechPreferences = {
  presetId: 'recommended', modeId: 'recommended', rate: GOLDEN_PRESET.rate, pitch: GOLDEN_PRESET.pitch, volume: GOLDEN_PRESET.volume,
  sentencePauseMs: GOLDEN_PRESET.sentencePauseMs, paragraphPauseMs: GOLDEN_PRESET.paragraphPauseMs, headingPauseMs: GOLDEN_PRESET.headingPauseMs,
  pronunciationRules: [], skipHeadings: false, skipUrls: true, skipCitations: true, skipConsecutiveDuplicates: true, favoriteVoiceIds: [], recentVoiceIds: [],
  recommendedListening: true, smartFilteringEnabled: true, podcastModeEnabled: false, skipLongNumbersAndCodes: true, skipReferenceSection: true, skipSiteBoilerplate: true,
};

export function runGoldenListeningFixtures() {
  const best = getBestGoldenVoice(voices, 'en-US', 'en-compact');
  if (best?.identifier !== 'en-enhanced') throw new Error('Golden kept a lower-quality preferred voice');
  if (rankAvailableVoices(voices, 'en-US').some((voice) => voice.language.startsWith('fr'))) throw new Error('wrong-language voice was ranked as compatible');
  if (getBestGoldenVoice(voices.filter((voice) => voice.quality !== 'Enhanced'), 'en-US')?.identifier !== 'en-compact') throw new Error('default-quality fallback failed');
  if (getBestGoldenVoice(voices, 'de-DE') !== undefined) throw new Error('missing-language fallback should defer to the system voice');
  const runtime = resolveRuntimeSpeechPreferences(goldenPreferences, { language: 'en-US', selectedVoice: 'en-compact' } as LibraryItem, voices);
  if (runtime.voiceIdentifier !== 'en-enhanced' || runtime.rate !== GOLDEN_PRESET.rate || runtime.sentencePauseMs !== GOLDEN_PRESET.sentencePauseMs) throw new Error('runtime Golden resolver drifted from the active baseline');

  const applied = applyGoldenPreset();
  if (applied.rate !== 0.96 || applied.pitch !== 1 || applied.volume !== 0.97 || applied.sentencePauseMs !== 220 || applied.paragraphPauseMs !== 520 || applied.headingPauseMs !== 750) throw new Error('Golden constants were not applied');
  if (!isGoldenControlledChange({ voiceIdentifier: 'en-enhanced' }) || !isGoldenControlledChange({ sentencePauseMs: 300 }) || isGoldenControlledChange({ favoriteVoiceIds: ['en-enhanced'] })) throw new Error('Golden manual-change detection is incorrect');

  const baseline = { ...goldenPreferences, voiceIdentifier: 'en-enhanced' };
  const freshProfile = createGoldenAdaptiveProfile();
  if (applyGoldenPersonalization(baseline, freshProfile, voices, 'en-US').rate !== GOLDEN_PRESET.rate) throw new Error('fresh Golden profile changed the baseline');
  const readyProfile = { ...freshProfile, feedbackCount: 1, nextExperimentAt: new Date(0).toISOString() };
  const experiment = startGoldenExperiment(readyProfile, baseline, voices, 'en-US', 10_000);
  if (!experiment.activeExperiment || experiment.activeExperiment.parameter === 'voice') throw new Error('Golden did not start one safe numeric experiment');
  const tested = applyGoldenPersonalization(baseline, experiment, voices, 'en-US');
  if (tested.rate === baseline.rate && tested.pitch === baseline.pitch && tested.sentencePauseMs === baseline.sentencePauseMs && tested.paragraphPauseMs === baseline.paragraphPauseMs) throw new Error('Golden experiment did not affect its one selected parameter');
  const accepted = recordGoldenFeedback(experiment, 'good', 20_000);
  if (accepted.activeExperiment || !accepted.lastAdjustment || accepted.feedbackCount !== 2) throw new Error('Golden positive feedback did not commit the experiment');
  const restored = validateGoldenAdaptiveProfile(JSON.parse(JSON.stringify(accepted)));
  if (!restored || restored.history.length === 0) throw new Error('Golden profile learning history did not survive persistence round-trip');
  const undone = undoLastGoldenAdjustment(accepted, 21_000);
  if (undone.lastAdjustment || undone.rejectedAdjustmentCount !== 1 || undone.rate.offset !== 0 && undone.pitch.offset !== 0 && undone.sentencePause.offset !== 0 && undone.paragraphPause.offset !== 0) throw new Error('Golden undo did not restore the best-known profile');
  const negative = recordGoldenFeedback({ ...freshProfile, feedbackCount: 1, nextExperimentAt: new Date(0).toISOString() }, 'notQuite', 30_000, 'tooFast');
  if (negative.queuedExperiment?.parameter !== 'rate' || negative.queuedExperiment.direction !== -1) throw new Error('Golden direct negative feedback did not queue a slower rate experiment');
  if (validateGoldenAdaptiveProfile({ version: 1, rate: { offset: Number.NaN } }) !== null) throw new Error('corrupt Golden profile was not rejected');

  const chunks = processSpeechText('# Clear heading\nFirst sentence. Second sentence.\n\nNext paragraph.\n\n- First item\n- Second item', goldenPreferences, 'en-US');
  const heading = chunks.find((chunk) => chunk.text === 'Clear heading');
  const firstSentence = chunks.find((chunk) => chunk.text === 'First sentence.');
  const secondSentence = chunks.find((chunk) => chunk.text === 'Second sentence.');
  const firstItem = chunks.find((chunk) => chunk.text === 'First item');
  if (heading?.pauseAfterMs !== 750 || firstSentence?.pauseAfterMs !== 220 || secondSentence?.pauseAfterMs !== 520 || firstItem?.pauseAfterMs !== 220) throw new Error('Golden structural pacing did not preserve heading, sentence, paragraph, and list pauses');

  return { bestVoice: best.identifier, chunks: chunks.length };
}
