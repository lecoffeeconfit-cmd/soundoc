import type { SpeechPreferences, Voice } from '../types';
import { GOLDEN_PRESET, getBestGoldenVoice, rankAvailableVoices } from './goldenListening';

export type GoldenParameter = 'rate' | 'pitch' | 'sentencePause' | 'paragraphPause' | 'voice';
export type GoldenFeedbackReason = 'tooFast' | 'tooSlow' | 'voice' | 'pauses' | 'tooShort' | 'tooLong' | 'somethingElse';
export type GoldenFeedbackKind = 'good' | 'notQuite';
export type GoldenParameterState = { offset: number; positiveEvidence: number; negativeEvidence: number; preferredDirection: -1 | 0 | 1; confidence: number; lastDirectionTested?: -1 | 1; stepSize: number };
export type GoldenActiveExperiment = { id: string; parameter: GoldenParameter; direction?: -1 | 1; previousValue: number | string; testValue: number | string; previousOffset?: number; testOffset?: number; startedAt: string };
export type GoldenQueuedExperiment = { parameter: GoldenParameter; direction?: -1 | 1; notBefore: string };
export type GoldenLastAdjustment = { experimentId: string; parameter: GoldenParameter; previousValue: number | string; nextValue: number | string; previousOffset?: number; nextOffset?: number; appliedAt: string };
export type GoldenHistoryEntry = { at: string; kind: GoldenFeedbackKind | 'manual' | 'undo'; reason?: GoldenFeedbackReason; parameter?: GoldenParameter; experimentId?: string; detail: string };

export type GoldenAdaptiveProfile = {
  version: 1;
  rate: GoldenParameterState;
  pitch: GoldenParameterState;
  sentencePause: GoldenParameterState;
  paragraphPause: GoldenParameterState;
  voice: GoldenParameterState;
  preferredVoiceId?: string;
  overallConfidence: number;
  feedbackCount: number;
  totalListeningSeconds: number;
  listeningSecondsAtLastFeedback: number;
  lastFeedbackAt?: string;
  lastFeedbackPromptAt?: string;
  lastExperimentAt?: string;
  nextExperimentAt?: string;
  activeExperiment?: GoldenActiveExperiment;
  queuedExperiment?: GoldenQueuedExperiment;
  lastAdjustment?: GoldenLastAdjustment;
  rejectedAdjustmentCount: number;
  history: GoldenHistoryEntry[];
};

export type GoldenRuntimeValues = Pick<SpeechPreferences, 'rate' | 'pitch' | 'volume' | 'sentencePauseMs' | 'paragraphPauseMs' | 'headingPauseMs'> & { voiceIdentifier?: string };

export const GOLDEN_PROFILE_VERSION = 1 as const;
export const GOLDEN_PROFILE_STORAGE_KEY = 'soundoc.golden.profile.v1';

const PARAMETER_LIMITS: Record<Exclude<GoldenParameter, 'voice'>, number> = {
  rate: 0.08,
  pitch: 0.06,
  sentencePause: 80,
  paragraphPause: 150,
};

const BASE_STEPS: Record<Exclude<GoldenParameter, 'voice'>, number> = { rate: 0.03, pitch: 0.02, sentencePause: 40, paragraphPause: 70 };
const MIN_EXPERIMENT_DELAY_MS = 2 * 60 * 1000;
const UNDO_WINDOW_MS = 30 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const direction = (value: unknown): -1 | 0 | 1 => value === -1 || value === 1 ? value : 0;
const signedDirection = (value: unknown): -1 | 1 | undefined => value === -1 || value === 1 ? value : undefined;
const isoOrUndefined = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined;
const parameterNames: GoldenParameter[] = ['rate', 'pitch', 'sentencePause', 'paragraphPause', 'voice'];

function parameterState(stepSize: number): GoldenParameterState { return { offset: 0, positiveEvidence: 0, negativeEvidence: 0, preferredDirection: 0, confidence: 0, stepSize }; }

export function createGoldenAdaptiveProfile(): GoldenAdaptiveProfile {
  return { version: GOLDEN_PROFILE_VERSION, rate: parameterState(BASE_STEPS.rate), pitch: parameterState(BASE_STEPS.pitch), sentencePause: parameterState(BASE_STEPS.sentencePause), paragraphPause: parameterState(BASE_STEPS.paragraphPause), voice: parameterState(1), overallConfidence: 0, feedbackCount: 0, totalListeningSeconds: 0, listeningSecondsAtLastFeedback: 0, rejectedAdjustmentCount: 0, history: [] };
}

function readParameterState(value: unknown, defaultStep: number): GoldenParameterState | null {
  if (!isRecord(value) || !finite(value.offset) || !finite(value.positiveEvidence) || !finite(value.negativeEvidence) || !finite(value.confidence)) return null;
  const stepSize = finite(value.stepSize) && value.stepSize > 0 ? value.stepSize : defaultStep;
  return { offset: value.offset, positiveEvidence: clamp(value.positiveEvidence, 0, 1000), negativeEvidence: clamp(value.negativeEvidence, 0, 1000), preferredDirection: direction(value.preferredDirection), confidence: clamp(value.confidence, 0, 1), lastDirectionTested: signedDirection(value.lastDirectionTested), stepSize };
}

function readExperiment(value: unknown): GoldenActiveExperiment | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !parameterNames.includes(value.parameter as GoldenParameter) || (!finite(value.previousValue) && typeof value.previousValue !== 'string') || (!finite(value.testValue) && typeof value.testValue !== 'string')) return undefined;
  const startedAt = isoOrUndefined(value.startedAt);
  if (!startedAt) return undefined;
  const experiment: GoldenActiveExperiment = { id: value.id, parameter: value.parameter as GoldenParameter, previousValue: value.previousValue as number | string, testValue: value.testValue as number | string, startedAt };
  const experimentDirection = signedDirection(value.direction);
  if (experimentDirection) experiment.direction = experimentDirection;
  if (finite(value.previousOffset)) experiment.previousOffset = value.previousOffset;
  if (finite(value.testOffset)) experiment.testOffset = value.testOffset;
  return experiment;
}

export function validateGoldenAdaptiveProfile(value: unknown): GoldenAdaptiveProfile | null {
  if (!isRecord(value) || value.version !== GOLDEN_PROFILE_VERSION) return null;
  const rate = readParameterState(value.rate, BASE_STEPS.rate);
  const pitch = readParameterState(value.pitch, BASE_STEPS.pitch);
  const sentencePause = readParameterState(value.sentencePause, BASE_STEPS.sentencePause);
  const paragraphPause = readParameterState(value.paragraphPause, BASE_STEPS.paragraphPause);
  const voice = readParameterState(value.voice, 1);
  if (!rate || !pitch || !sentencePause || !paragraphPause || !voice || !finite(value.overallConfidence) || !finite(value.feedbackCount) || !finite(value.totalListeningSeconds) || !finite(value.listeningSecondsAtLastFeedback) || !finite(value.rejectedAdjustmentCount)) return null;
  const profile = createGoldenAdaptiveProfile();
  profile.rate = rate; profile.pitch = pitch; profile.sentencePause = sentencePause; profile.paragraphPause = paragraphPause; profile.voice = voice;
  profile.preferredVoiceId = typeof value.preferredVoiceId === 'string' && value.preferredVoiceId ? value.preferredVoiceId : undefined;
  profile.overallConfidence = clamp(value.overallConfidence, 0, 1);
  profile.feedbackCount = clamp(Math.round(value.feedbackCount), 0, 1000);
  profile.totalListeningSeconds = clamp(value.totalListeningSeconds, 0, 10_000_000);
  profile.listeningSecondsAtLastFeedback = clamp(value.listeningSecondsAtLastFeedback, 0, profile.totalListeningSeconds);
  profile.lastFeedbackAt = isoOrUndefined(value.lastFeedbackAt);
  profile.lastFeedbackPromptAt = isoOrUndefined(value.lastFeedbackPromptAt);
  profile.lastExperimentAt = isoOrUndefined(value.lastExperimentAt);
  profile.nextExperimentAt = isoOrUndefined(value.nextExperimentAt);
  profile.activeExperiment = readExperiment(value.activeExperiment);
  if (isRecord(value.queuedExperiment) && parameterNames.includes(value.queuedExperiment.parameter as GoldenParameter) && isoOrUndefined(value.queuedExperiment.notBefore)) profile.queuedExperiment = { parameter: value.queuedExperiment.parameter as GoldenParameter, direction: signedDirection(value.queuedExperiment.direction), notBefore: isoOrUndefined(value.queuedExperiment.notBefore) as string };
  if (isRecord(value.lastAdjustment) && typeof value.lastAdjustment.experimentId === 'string' && parameterNames.includes(value.lastAdjustment.parameter as GoldenParameter) && (!finite(value.lastAdjustment.previousValue) && typeof value.lastAdjustment.previousValue !== 'string' || !finite(value.lastAdjustment.nextValue) && typeof value.lastAdjustment.nextValue !== 'string')) return null;
  if (isRecord(value.lastAdjustment) && typeof value.lastAdjustment.experimentId === 'string' && parameterNames.includes(value.lastAdjustment.parameter as GoldenParameter) && isoOrUndefined(value.lastAdjustment.appliedAt)) profile.lastAdjustment = { experimentId: value.lastAdjustment.experimentId, parameter: value.lastAdjustment.parameter as GoldenParameter, previousValue: value.lastAdjustment.previousValue as number | string, nextValue: value.lastAdjustment.nextValue as number | string, previousOffset: finite(value.lastAdjustment.previousOffset) ? value.lastAdjustment.previousOffset : undefined, nextOffset: finite(value.lastAdjustment.nextOffset) ? value.lastAdjustment.nextOffset : undefined, appliedAt: isoOrUndefined(value.lastAdjustment.appliedAt) as string };
  profile.rejectedAdjustmentCount = clamp(Math.round(value.rejectedAdjustmentCount), 0, 1000);
  profile.history = Array.isArray(value.history) ? value.history.filter((entry): entry is Record<string, unknown> => isRecord(entry) && Boolean(isoOrUndefined(entry.at)) && typeof entry.detail === 'string' && (entry.kind === 'good' || entry.kind === 'notQuite' || entry.kind === 'manual' || entry.kind === 'undo')).slice(-50).map((entry) => ({ at: isoOrUndefined(entry.at) as string, kind: entry.kind as GoldenHistoryEntry['kind'], reason: typeof entry.reason === 'string' ? entry.reason as GoldenFeedbackReason : undefined, parameter: parameterNames.includes(entry.parameter as GoldenParameter) ? entry.parameter as GoldenParameter : undefined, experimentId: typeof entry.experimentId === 'string' ? entry.experimentId : undefined, detail: entry.detail as string })) : [];
  return profile;
}

function addHistory(profile: GoldenAdaptiveProfile, entry: GoldenHistoryEntry) { profile.history = [...profile.history, entry].slice(-50); }

function safeProfile(profile?: GoldenAdaptiveProfile | null) { return profile ? validateGoldenAdaptiveProfile(profile) : null; }
function parameterValue(parameter: Exclude<GoldenParameter, 'voice'>, baseline: GoldenRuntimeValues) { return parameter === 'rate' ? baseline.rate : parameter === 'pitch' ? baseline.pitch : parameter === 'sentencePause' ? baseline.sentencePauseMs : baseline.paragraphPauseMs; }
function valueWithOffset(parameter: Exclude<GoldenParameter, 'voice'>, baseline: GoldenRuntimeValues, offset: number) { return parameterValue(parameter, baseline) + clamp(offset, -PARAMETER_LIMITS[parameter], PARAMETER_LIMITS[parameter]); }
function experimentValue(parameter: Exclude<GoldenParameter, 'voice'>, baseline: GoldenRuntimeValues, profile: GoldenAdaptiveProfile) {
  const active = profile.activeExperiment?.parameter === parameter ? profile.activeExperiment : undefined;
  return active && finite(active.testValue) ? clamp(active.testValue, parameterValue(parameter, baseline) - PARAMETER_LIMITS[parameter], parameterValue(parameter, baseline) + PARAMETER_LIMITS[parameter]) : valueWithOffset(parameter, baseline, profile[parameter].offset);
}

function suitableVoiceCandidates(voices: readonly Voice[], language: string) {
  const ranked = rankAvailableVoices(voices, language);
  const nonCompact = ranked.filter((voice) => !/compact/i.test(`${voice.name} ${voice.identifier}`));
  return nonCompact.length > 1 ? nonCompact : ranked;
}

export function applyGoldenPersonalization(baseline: SpeechPreferences, profileInput: GoldenAdaptiveProfile | null | undefined, voices: readonly Voice[], language: string): SpeechPreferences {
  const profile = safeProfile(profileInput);
  if (!baseline.recommendedListening || !profile) return baseline;
  try {
    const next = { ...baseline, rate: experimentValue('rate', baseline, profile), pitch: experimentValue('pitch', baseline, profile), sentencePauseMs: experimentValue('sentencePause', baseline, profile), paragraphPauseMs: experimentValue('paragraphPause', baseline, profile) };
    const baselineVoice = baseline.voiceIdentifier ?? getBestGoldenVoice(voices, language)?.identifier;
    const activeVoice = profile.activeExperiment?.parameter === 'voice' && typeof profile.activeExperiment.testValue === 'string' ? profile.activeExperiment.testValue : profile.preferredVoiceId;
    const eligible = suitableVoiceCandidates(voices, language).some((voice) => voice.identifier === activeVoice);
    return { ...next, voiceIdentifier: eligible ? activeVoice : baselineVoice };
  } catch {
    return baseline;
  }
}

function confidenceStatus(confidence: number) { return confidence >= 0.72 ? 'Learned' : confidence >= 0.32 ? 'Fine-tuning' : 'Still learning'; }
export function goldenParameterStatus(profile: GoldenAdaptiveProfile | null | undefined, parameter: GoldenParameter) { return confidenceStatus(profile ? profile[parameter].confidence : 0); }
export function goldenProfileStatus(profile: GoldenAdaptiveProfile | null | undefined) { return profile && profile.overallConfidence >= 0.72 ? 'Personalized for you' : profile && profile.overallConfidence >= 0.32 ? 'Fine-tuning your Golden sound' : 'Learning your preferences'; }

export function goldenLearningSummary(profileInput: GoldenAdaptiveProfile | null | undefined) {
  const profile = safeProfile(profileInput) ?? createGoldenAdaptiveProfile();
  const learned: string[] = [];
  const learning: string[] = [];
  if (profile.rate.confidence >= 0.5 && profile.rate.positiveEvidence >= 2 && profile.rate.offset > 0.005) learned.push('You tend to prefer slightly faster speech.');
  else if (profile.rate.confidence >= 0.5 && profile.rate.positiveEvidence >= 2 && profile.rate.offset < -0.005) learned.push('You tend to prefer slightly slower speech.');
  else learning.push('Still learning your preferred pace.');
  if (profile.sentencePause.confidence >= 0.5 && profile.sentencePause.positiveEvidence >= 2 && profile.sentencePause.offset > 8) learned.push('Longer sentence pauses have received positive feedback.');
  else if (profile.sentencePause.confidence < 0.5) learning.push('Still learning your sentence rhythm.');
  if (profile.paragraphPause.confidence >= 0.5 && profile.paragraphPause.positiveEvidence >= 2 && profile.paragraphPause.offset > 15) learned.push('Longer paragraph pauses have received positive feedback.');
  else if (profile.paragraphPause.confidence < 0.5) learning.push('Still learning your paragraph rhythm.');
  if (profile.voice.confidence >= 0.5 && profile.voice.positiveEvidence >= 2 && profile.preferredVoiceId) learned.push('Your current voice has been consistently preferred.');
  else if (profile.voice.confidence < 0.5) learning.push('Still learning your preferred voice.');
  return { learned, learning };
}

export function goldenMeaningfulDifferences(baseline: GoldenRuntimeValues, effective: GoldenRuntimeValues) {
  return [
    { parameter: 'rate' as const, label: 'Pace', baseline: baseline.rate, current: effective.rate, meaningful: Math.abs(effective.rate - baseline.rate) >= 0.005 },
    { parameter: 'pitch' as const, label: 'Pitch', baseline: baseline.pitch, current: effective.pitch, meaningful: Math.abs(effective.pitch - baseline.pitch) >= 0.005 },
    { parameter: 'sentencePause' as const, label: 'Sentence pauses', baseline: baseline.sentencePauseMs, current: effective.sentencePauseMs, meaningful: Math.abs(effective.sentencePauseMs - baseline.sentencePauseMs) >= 5 },
    { parameter: 'paragraphPause' as const, label: 'Paragraph pauses', baseline: baseline.paragraphPauseMs, current: effective.paragraphPauseMs, meaningful: Math.abs(effective.paragraphPauseMs - baseline.paragraphPauseMs) >= 5 },
    { parameter: 'voice' as const, label: 'Voice', baseline: baseline.voiceIdentifier, current: effective.voiceIdentifier, meaningful: Boolean(baseline.voiceIdentifier && effective.voiceIdentifier && baseline.voiceIdentifier !== effective.voiceIdentifier) },
  ].filter((entry) => entry.meaningful);
}

function updateOverallConfidence(profile: GoldenAdaptiveProfile) { profile.overallConfidence = (profile.rate.confidence + profile.pitch.confidence + profile.sentencePause.confidence + profile.paragraphPause.confidence + profile.voice.confidence) / 5; }
function nextFeedbackDelay(profile: GoldenAdaptiveProfile) { return Math.min(45 * 60 * 1000, (profile.feedbackCount < 3 ? 8 : 15) * 60 * 1000); }
function queueForReason(reason: GoldenFeedbackReason | undefined, profile: GoldenAdaptiveProfile, now: number): GoldenQueuedExperiment | undefined {
  const parameter: GoldenParameter = reason === 'voice' ? 'voice' : reason === 'pauses' || reason === 'tooShort' || reason === 'tooLong' ? (reason === 'tooShort' || reason === 'tooLong' ? 'sentencePause' : 'paragraphPause') : 'rate';
  const requestedDirection: -1 | 1 | undefined = reason === 'tooFast' || reason === 'tooLong' ? -1 : reason === 'tooSlow' || reason === 'tooShort' ? 1 : undefined;
  const state = profile[parameter];
  const fallback = state.preferredDirection === 0 ? 1 : state.preferredDirection;
  return { parameter, direction: requestedDirection ?? fallback, notBefore: new Date(now + MIN_EXPERIMENT_DELAY_MS).toISOString() };
}

export function recordGoldenFeedback(profileInput: GoldenAdaptiveProfile, kind: GoldenFeedbackKind, now = Date.now(), reason?: GoldenFeedbackReason): GoldenAdaptiveProfile {
  const profile = validateGoldenAdaptiveProfile(profileInput) ?? createGoldenAdaptiveProfile();
  profile.feedbackCount += 1; profile.lastFeedbackAt = new Date(now).toISOString(); profile.listeningSecondsAtLastFeedback = profile.totalListeningSeconds; profile.nextExperimentAt = new Date(now + nextFeedbackDelay(profile)).toISOString();
  const active = profile.activeExperiment;
  if (active && kind === 'good') {
    const state = profile[active.parameter];
    state.positiveEvidence += 1; state.confidence = clamp(state.confidence + 0.15, 0, 1); state.lastDirectionTested = active.direction;
    if (active.direction) state.preferredDirection = active.direction;
    if (active.parameter === 'voice') profile.preferredVoiceId = typeof active.testValue === 'string' ? active.testValue : profile.preferredVoiceId;
    else if (finite(active.testOffset)) state.offset = clamp(active.testOffset, -PARAMETER_LIMITS[active.parameter], PARAMETER_LIMITS[active.parameter]);
    profile.lastAdjustment = { experimentId: active.id, parameter: active.parameter, previousValue: active.previousValue, nextValue: active.testValue, previousOffset: active.previousOffset, nextOffset: active.testOffset, appliedAt: new Date(now).toISOString() };
    addHistory(profile, { at: new Date(now).toISOString(), kind, reason, parameter: active.parameter, experimentId: active.id, detail: `${active.parameter} experiment accepted` });
    profile.activeExperiment = undefined; profile.queuedExperiment = undefined;
  } else if (active && kind === 'notQuite') {
    const state = profile[active.parameter]; state.negativeEvidence += 1; state.confidence = clamp(state.confidence - 0.04, 0, 1); state.lastDirectionTested = active.direction;
    const queued = reason ? queueForReason(reason, profile, now) : undefined;
    profile.queuedExperiment = queued ?? { parameter: active.parameter, direction: active.direction === undefined ? undefined : active.direction === 1 ? -1 : 1, notBefore: new Date(now + MIN_EXPERIMENT_DELAY_MS).toISOString() };
    addHistory(profile, { at: new Date(now).toISOString(), kind, reason, parameter: active.parameter, experimentId: active.id, detail: `${active.parameter} experiment rejected` });
    profile.nextExperimentAt = profile.queuedExperiment.notBefore; profile.activeExperiment = undefined;
  } else if (kind === 'notQuite') {
    profile.queuedExperiment = queueForReason(reason, profile, now); profile.nextExperimentAt = profile.queuedExperiment?.notBefore;
    if (profile.queuedExperiment) { const state = profile[profile.queuedExperiment.parameter]; state.negativeEvidence += 0.5; state.confidence = clamp(state.confidence - 0.02, 0, 1); }
    addHistory(profile, { at: new Date(now).toISOString(), kind, reason, parameter: profile.queuedExperiment?.parameter, detail: 'General Golden feedback recorded' });
  } else {
    (['rate', 'pitch', 'sentencePause', 'paragraphPause', 'voice'] as const).forEach((parameter) => { profile[parameter].positiveEvidence += 0.25; profile[parameter].confidence = clamp(profile[parameter].confidence + 0.03, 0, 1); });
    addHistory(profile, { at: new Date(now).toISOString(), kind, detail: 'Current Golden configuration reinforced' });
  }
  updateOverallConfidence(profile);
  return profile;
}

export function refineGoldenFeedback(profileInput: GoldenAdaptiveProfile, reason: GoldenFeedbackReason, now = Date.now()): GoldenAdaptiveProfile {
  const profile = validateGoldenAdaptiveProfile(profileInput) ?? createGoldenAdaptiveProfile();
  const queued = queueForReason(reason, profile, now);
  if (!queued) return profile;
  const state = profile[queued.parameter]; state.negativeEvidence += 0.5; state.confidence = clamp(state.confidence - 0.02, 0, 1);
  profile.queuedExperiment = queued; profile.nextExperimentAt = queued.notBefore; addHistory(profile, { at: new Date(now).toISOString(), kind: 'notQuite', reason, parameter: queued.parameter, detail: 'Specific feedback added stronger evidence' }); updateOverallConfidence(profile); return profile;
}

function experimentStep(parameter: Exclude<GoldenParameter, 'voice'>, confidence: number) { const base = BASE_STEPS[parameter]; return base * (confidence >= 0.72 ? 0.34 : confidence >= 0.32 ? 0.67 : 1); }

export function startGoldenExperiment(profileInput: GoldenAdaptiveProfile, baseline: GoldenRuntimeValues, voices: readonly Voice[], language: string, now = Date.now()): GoldenAdaptiveProfile {
  const profile = validateGoldenAdaptiveProfile(profileInput) ?? createGoldenAdaptiveProfile();
  if (profile.activeExperiment || profile.feedbackCount < 1 || (profile.nextExperimentAt && Date.parse(profile.nextExperimentAt) > now)) return profile;
  const queued = profile.queuedExperiment;
  if (queued && Date.parse(queued.notBefore) > now) return profile;
  let parameter: GoldenParameter = queued?.parameter ?? [...(['rate', 'sentencePause', 'paragraphPause', 'pitch'] as const)].sort((a, b) => profile[a].confidence - profile[b].confidence)[0];
  if (!queued && profile.feedbackCount >= 6 && profile.feedbackCount % 6 === 0 && suitableVoiceCandidates(voices, language).length > 1) parameter = 'voice';
  if (parameter === 'voice') {
    const candidates = suitableVoiceCandidates(voices, language); const current = profile.preferredVoiceId ?? baseline.voiceIdentifier ?? getBestGoldenVoice(voices, language)?.identifier; const index = candidates.findIndex((voice) => voice.identifier === current); const candidate = candidates[(index + 1 + candidates.length) % candidates.length] ?? candidates.find((voice) => voice.identifier !== current);
    if (!candidate || candidate.identifier === current) return { ...profile, nextExperimentAt: new Date(now + nextFeedbackDelay(profile)).toISOString() };
    profile.activeExperiment = { id: `golden-${now}`, parameter: 'voice', previousValue: current ?? '', testValue: candidate.identifier, startedAt: new Date(now).toISOString() };
  } else {
    const state = profile[parameter]; const baselineValue = parameterValue(parameter, baseline); let testDirection: -1 | 1 = queued?.direction ?? (state.preferredDirection || (state.lastDirectionTested === 1 ? -1 : 1)); let testOffset = clamp(state.offset + testDirection * experimentStep(parameter, state.confidence), -PARAMETER_LIMITS[parameter], PARAMETER_LIMITS[parameter]);
    if (testOffset === state.offset) { testDirection = testDirection === 1 ? -1 : 1; testOffset = clamp(state.offset + testDirection * experimentStep(parameter, state.confidence), -PARAMETER_LIMITS[parameter], PARAMETER_LIMITS[parameter]); }
    if (testOffset === state.offset) return { ...profile, nextExperimentAt: new Date(now + nextFeedbackDelay(profile)).toISOString() };
    profile.activeExperiment = { id: `golden-${now}`, parameter, direction: testDirection, previousValue: valueWithOffset(parameter, baseline, state.offset), testValue: baselineValue + testOffset, previousOffset: state.offset, testOffset, startedAt: new Date(now).toISOString() };
  }
  profile.queuedExperiment = undefined; profile.lastExperimentAt = new Date(now).toISOString(); profile.nextExperimentAt = undefined; return profile;
}

export function addGoldenListeningSeconds(profileInput: GoldenAdaptiveProfile, seconds: number) { const profile = validateGoldenAdaptiveProfile(profileInput) ?? createGoldenAdaptiveProfile(); if (!finite(seconds) || seconds <= 0) return profile; profile.totalListeningSeconds = clamp(profile.totalListeningSeconds + seconds, 0, 10_000_000); return profile; }
export function markGoldenFeedbackPrompt(profileInput: GoldenAdaptiveProfile, now = Date.now()) { const profile = validateGoldenAdaptiveProfile(profileInput) ?? createGoldenAdaptiveProfile(); profile.lastFeedbackPromptAt = new Date(now).toISOString(); return profile; }
function isGoldenFeedbackCooldownActive(profile: GoldenAdaptiveProfile, now: number) {
  if (profile.lastFeedbackAt && now - Date.parse(profile.lastFeedbackAt) < 3 * 60 * 1000) return true;
  if (profile.lastFeedbackPromptAt && now - Date.parse(profile.lastFeedbackPromptAt) < 10 * 60 * 1000) return true;
  return false;
}
export function shouldPromptGoldenFeedback(profileInput: GoldenAdaptiveProfile | null | undefined, now = Date.now()) {
  const profile = safeProfile(profileInput); if (!profile) return false;
  if (isGoldenFeedbackCooldownActive(profile, now)) return false;
  const threshold = profile.feedbackCount < 1 ? 120 : profile.feedbackCount < 4 ? 180 : 300;
  return profile.totalListeningSeconds - profile.listeningSecondsAtLastFeedback >= threshold;
}
export function shouldPromptGoldenFeedbackOnPause(profileInput: GoldenAdaptiveProfile | null | undefined, now = Date.now()) {
  const profile = safeProfile(profileInput); if (!profile || isGoldenFeedbackCooldownActive(profile, now)) return false;
  return profile.totalListeningSeconds - profile.listeningSecondsAtLastFeedback >= 5;
}

export function canUndoGoldenAdjustment(profileInput: GoldenAdaptiveProfile | null | undefined, now = Date.now()) { const profile = safeProfile(profileInput); return Boolean(profile?.lastAdjustment && now - Date.parse(profile.lastAdjustment.appliedAt) <= UNDO_WINDOW_MS); }
export function undoLastGoldenAdjustment(profileInput: GoldenAdaptiveProfile, now = Date.now()) {
  const profile = validateGoldenAdaptiveProfile(profileInput) ?? createGoldenAdaptiveProfile(); const adjustment = profile.lastAdjustment; if (!adjustment || now - Date.parse(adjustment.appliedAt) > UNDO_WINDOW_MS) return profile;
  const state = profile[adjustment.parameter]; state.negativeEvidence += 1; state.confidence = clamp(state.confidence - 0.06, 0, 1); if (adjustment.parameter === 'voice') profile.preferredVoiceId = typeof adjustment.previousValue === 'string' ? adjustment.previousValue || undefined : profile.preferredVoiceId; else if (finite(adjustment.previousOffset)) state.offset = clamp(adjustment.previousOffset, -PARAMETER_LIMITS[adjustment.parameter], PARAMETER_LIMITS[adjustment.parameter]);
  profile.rejectedAdjustmentCount += 1; addHistory(profile, { at: new Date(now).toISOString(), kind: 'undo', parameter: adjustment.parameter, experimentId: adjustment.experimentId, detail: 'Last Golden adjustment undone' }); profile.lastAdjustment = undefined; profile.activeExperiment = undefined; profile.queuedExperiment = undefined; profile.nextExperimentAt = new Date(now + 5 * 60 * 1000).toISOString(); updateOverallConfidence(profile); return profile;
}

export function recordGoldenManualSignal(profileInput: GoldenAdaptiveProfile, parameter: Exclude<GoldenParameter, 'voice'>, requestedValue: number, baseline: GoldenRuntimeValues, now = Date.now()) {
  const profile = validateGoldenAdaptiveProfile(profileInput) ?? createGoldenAdaptiveProfile(); const baselineValue = parameterValue(parameter, baseline); const requestedOffset = clamp(requestedValue - baselineValue, -PARAMETER_LIMITS[parameter], PARAMETER_LIMITS[parameter]); const state = profile[parameter]; const requestedDirection: -1 | 1 | 0 = requestedOffset === 0 ? 0 : requestedOffset > 0 ? 1 : -1;
  if (!requestedDirection) return profile;
  if (profile.activeExperiment?.parameter === parameter) { state.negativeEvidence += 0.5; state.confidence = clamp(state.confidence - 0.02, 0, 1); profile.queuedExperiment = { parameter, direction: profile.activeExperiment.direction === 1 ? -1 : 1, notBefore: new Date(now + MIN_EXPERIMENT_DELAY_MS).toISOString() }; profile.activeExperiment = undefined; profile.nextExperimentAt = profile.queuedExperiment.notBefore; }
  state.lastDirectionTested = requestedDirection; state.positiveEvidence += 0.25; state.confidence = clamp(state.confidence + 0.025, 0, 1);
  if (state.positiveEvidence >= 3 && state.positiveEvidence > state.negativeEvidence + 1) { state.offset = clamp((state.offset * 0.7) + (requestedOffset * 0.3), -PARAMETER_LIMITS[parameter], PARAMETER_LIMITS[parameter]); state.preferredDirection = requestedDirection; }
  profile.lastFeedbackAt = new Date(now).toISOString(); addHistory(profile, { at: new Date(now).toISOString(), kind: 'manual', parameter, detail: `Manual ${parameter} adjustment recorded as a weak signal` }); updateOverallConfidence(profile); return profile;
}

export function recordGoldenVoiceSignal(profileInput: GoldenAdaptiveProfile, voiceId: string | undefined, now = Date.now()) {
  const profile = validateGoldenAdaptiveProfile(profileInput) ?? createGoldenAdaptiveProfile(); if (!voiceId) return profile;
  const state = profile.voice; state.lastDirectionTested = 1; state.positiveEvidence += 0.25; state.confidence = clamp(state.confidence + 0.025, 0, 1);
  if (state.positiveEvidence >= 3 && state.positiveEvidence > state.negativeEvidence + 1) profile.preferredVoiceId = voiceId;
  profile.lastFeedbackAt = new Date(now).toISOString(); addHistory(profile, { at: new Date(now).toISOString(), kind: 'manual', parameter: 'voice', detail: 'Manual voice choice recorded as a weak signal' }); updateOverallConfidence(profile); return profile;
}

export function recordGoldenDisableSignal(profileInput: GoldenAdaptiveProfile, now = Date.now()) {
  const profile = validateGoldenAdaptiveProfile(profileInput) ?? createGoldenAdaptiveProfile(); const active = profile.activeExperiment; if (!active) return profile;
  const state = profile[active.parameter]; state.negativeEvidence += 0.5; state.confidence = clamp(state.confidence - 0.02, 0, 1); profile.queuedExperiment = { parameter: active.parameter, direction: active.direction === 1 ? -1 : 1, notBefore: new Date(now + MIN_EXPERIMENT_DELAY_MS).toISOString() }; profile.nextExperimentAt = profile.queuedExperiment.notBefore; profile.activeExperiment = undefined; addHistory(profile, { at: new Date(now).toISOString(), kind: 'notQuite', parameter: active.parameter, experimentId: active.id, detail: 'Golden was disabled after an active experiment' }); updateOverallConfidence(profile); return profile;
}
