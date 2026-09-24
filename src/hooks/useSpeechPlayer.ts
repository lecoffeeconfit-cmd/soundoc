import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { processSpeechText, remapSpeechChunkIndex, type SpeakableChunk } from '../lib/speechText';
import { previewText } from '../lib/speechPreview';
import { resolveRuntimeSpeechPreferences, resolveSpeechPreferences } from '../lib/listeningModes';
import { adaptiveChange } from '../lib/documentIntelligence';
import { recordCompletedDocument, recordListening } from '../lib/analytics';
import { removeArticleReferenceNoise } from '../lib/text';
import { getBestGoldenVoice, GOLDEN_PRESET, rankAvailableVoices } from '../lib/goldenListening';
import { getDocumentChunkCount, getDocumentChunkWindow, getLargeDocumentInfo } from '../lib/database';
import { FREE_LISTENING_CHECKPOINT_MS } from '../lib/freeListening';
import type { GoldenAdaptiveProfile } from '../lib/goldenPersonalization';
import type { LibraryItem, PlayerState, SpeechPreferences, Voice } from '../types';

const fallbackPreferences: SpeechPreferences = {
  presetId: 'recommended', modeId: 'recommended', rate: GOLDEN_PRESET.rate, pitch: GOLDEN_PRESET.pitch, volume: GOLDEN_PRESET.volume, sentencePauseMs: GOLDEN_PRESET.sentencePauseMs, paragraphPauseMs: GOLDEN_PRESET.paragraphPauseMs, headingPauseMs: GOLDEN_PRESET.headingPauseMs,
  pronunciationRules: [], skipHeadings: false, skipUrls: true, skipCitations: true, skipSiteBoilerplate: true, skipNavigationAndAds: true,
  skipConsecutiveDuplicates: true, favoriteVoiceIds: [], recentVoiceIds: [], adaptiveListeningEnabled: false, skipLongNumbersAndCodes: true, skipReferenceSection: true, recommendedListening: true,
  clearVoiceEnabled: false, podcastModeEnabled: false, smartFilteringEnabled: true,
};

export type FreePlaybackAccess = {
  isReady: boolean;
  canStartPlayback: () => boolean;
  consumeFreeListening: (elapsedSeconds: number) => { remainingSeconds: number; reachedLimit: boolean; crossedLowAllowance: boolean };
  onLowAllowanceReached?: () => void;
  onLimitReached?: () => void;
};

type FreePlaybackCheckpoint = { remainingSeconds: number; reachedLimit: boolean; crossedLowAllowance: boolean } | null;

function validVoiceIdentifier(requested: string | undefined, voices: readonly Voice[], language: string) {
  if (!requested) return undefined;
  if (voices.some((voice) => voice.identifier === requested)) return requested;
  // A persisted iOS identifier is not meaningful to Android. If the requested voice is
  // unavailable, choose a compatible installed voice before falling back to the engine default.
  return getBestGoldenVoice(voices, language)?.identifier;
}

function showSpeechError() {
  Alert.alert('Playback unavailable', 'Soundoc could not start the device speech engine. Check that a voice is installed, then try again.');
}

export function useSpeechPlayer(onProgress: (item: LibraryItem) => void, preferences: SpeechPreferences = fallbackPreferences, goldenProfile?: GoldenAdaptiveProfile | null, freePlaybackAccess?: FreePlaybackAccess) {
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [state, setState] = useState<PlayerState>('idle');
  const [voices, setVoices] = useState<Voice[]>([]);
  const chunkIndex = useRef(0);
  const active = useRef<LibraryItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSession = useRef<{ wasPlaying: boolean; resumeIndex: number; session: number; onFinished?: () => void } | null>(null);
  const speechSession = useRef(0);
  const nativePausedSession = useRef<number | null>(null);
  const androidPausedPosition = useRef<{ chunkIndex: number; offset: number } | null>(null);
  const speechOffset = useRef(0);
  const speechActive = useRef(false);
  const unavailableVoiceIds = useRef(new Set<string>());
  const largeChunkCache = useRef(new Map<string, { text: string; sectionId?: string; sectionTitle?: string }>());
  const preferencesRef = useRef(preferences);
  const goldenProfileRef = useRef(goldenProfile);
  const freePlaybackAccessRef = useRef(freePlaybackAccess);
  const freePlaybackMeter = useRef<{ session: number | null; startedAt: number | null; lastCheckpointAt: number | null; timer: ReturnType<typeof setInterval> | null; limitPending: boolean }>({ session: null, startedAt: null, lastCheckpointAt: null, timer: null, limitPending: false });
  const freeLimitNotified = useRef(false);
  preferencesRef.current = preferences;
  goldenProfileRef.current = goldenProfile;
  freePlaybackAccessRef.current = freePlaybackAccess;

  const refreshVoices = useCallback(async () => {
    try {
      const available = await Speech.getAvailableVoicesAsync();
      setVoices(available.map((voice) => ({
        identifier: voice.identifier, name: voice.name || voice.identifier, language: voice.language,
        quality: voice.quality,
      })));
    } catch {
      setVoices([]);
    }
  }, []);

  useEffect(() => {
    void refreshVoices();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refreshVoices();
    });
    return () => { subscription.remove(); if (timer.current) clearTimeout(timer.current); if (freePlaybackMeter.current.timer) clearInterval(freePlaybackMeter.current.timer); void Speech.stop(); };
  }, [refreshVoices]);

  const clearTimer = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  const notifyFreeLimit = useCallback(() => {
    if (freeLimitNotified.current) return;
    freeLimitNotified.current = true;
    freePlaybackAccessRef.current?.onLimitReached?.();
  }, []);
  const checkpointFreePlayback = useCallback((): FreePlaybackCheckpoint => {
    const meter = freePlaybackMeter.current;
    const access = freePlaybackAccessRef.current;
    if (!access || meter.startedAt === null || meter.lastCheckpointAt === null) return null;
    const now = Date.now();
    const elapsedSeconds = Math.max(0, (now - meter.lastCheckpointAt) / 1000);
    meter.lastCheckpointAt = now;
    if (elapsedSeconds <= 0) return null;
    const update = access.consumeFreeListening(elapsedSeconds);
    if (update.crossedLowAllowance) access.onLowAllowanceReached?.();
    if (update.reachedLimit || update.remainingSeconds <= 0) meter.limitPending = true;
    return update;
  }, []);
  const stopFreePlaybackMeter = useCallback(() => {
    const meter = freePlaybackMeter.current;
    const update = checkpointFreePlayback();
    if (meter.timer) clearInterval(meter.timer);
    meter.timer = null;
    meter.session = null;
    meter.startedAt = null;
    meter.lastCheckpointAt = null;
    return update;
  }, [checkpointFreePlayback]);
  const startFreePlaybackMeter = useCallback((session: number) => {
    const access = freePlaybackAccessRef.current;
    if (!access) return;
    stopFreePlaybackMeter();
    const meter = freePlaybackMeter.current;
    const now = Date.now();
    meter.session = session;
    meter.startedAt = now;
    meter.lastCheckpointAt = now;
    meter.limitPending = false;
    meter.timer = setInterval(() => { checkpointFreePlayback(); }, FREE_LISTENING_CHECKPOINT_MS);
  }, [checkpointFreePlayback, stopFreePlaybackMeter]);
  const canStartFreePlayback = useCallback(() => {
    const access = freePlaybackAccessRef.current;
    if (!access || access.canStartPlayback()) return true;
    if (!access.isReady) return false;
    notifyFreeLimit();
    return false;
  }, [notifyFreeLimit]);
  const startSpeechSession = useCallback(() => {
    const session = ++speechSession.current;
    clearTimer();
    stopFreePlaybackMeter();
    nativePausedSession.current = null;
    speechOffset.current = 0;
    speechActive.current = false;
    freeLimitNotified.current = false;
    return session;
  }, [clearTimer, stopFreePlaybackMeter]);
  const cancelSpeech = useCallback(() => {
    const session = startSpeechSession();
    androidPausedPosition.current = null;
    void Speech.stop();
    return session;
  }, [startSpeechSession]);
  const commit = useCallback((next: LibraryItem, status?: PlayerState) => {
    const now = Date.now(); const enriched = { ...next, lastOpenedAt: now, ...(status === 'completed' ? { completedAt: now } : {}) };
    active.current = enriched; setItem(enriched); onProgress(enriched); if (status) setState(status);
  }, [onProgress]);

  const persistedChunkFor = useCallback((current: LibraryItem, sequence = current.currentChunkIndex ?? 0) => {
    if (current.storageMode !== 'chunked') return undefined;
    const key = `${current.id}:${sequence}`; const cached = largeChunkCache.current.get(key);
    if (cached) return cached;
    const window = getDocumentChunkWindow(current.id, sequence, 4);
    window.forEach((chunk) => largeChunkCache.current.set(`${current.id}:${chunk.sequence}`, chunk));
    while (largeChunkCache.current.size > 5) largeChunkCache.current.delete(largeChunkCache.current.keys().next().value as string);
    return largeChunkCache.current.get(key);
  }, []);

  const speechSourceFor = useCallback((current: LibraryItem) => current.speakableText ?? persistedChunkFor(current)?.text ?? current.text, [persistedChunkFor]);

  const positionForChunk = useCallback((current: LibraryItem, chunk: SpeakableChunk, chunks: SpeakableChunk[], persisted?: { sectionId?: string }) => {
    const chunkPosition = Math.max(0, chunks.indexOf(chunk));
    const sectionIndex = current.sections?.length ? Math.min(current.sections.length - 1, Math.floor((chunkPosition / Math.max(1, chunks.length)) * current.sections.length)) : -1;
    const section = sectionIndex >= 0 ? current.sections?.[sectionIndex] : undefined;
    const characterOffset = chunks.slice(0, chunkPosition).reduce((total, candidate) => total + candidate.text.length + 1, 0) + chunk.characterOffset;
    return { currentSectionId: persisted?.sectionId ?? section?.id, currentParagraphIndex: chunk.paragraphIndex, currentCharacterOffset: characterOffset, sentenceIndex: chunkPosition };
  }, []);

  const speak = useCallback((index: number, session = speechSession.current, requestedOffset = 0) => {
    if (session !== speechSession.current) return;
    const current = active.current;
    if (!current) return;
    if (!canStartFreePlayback()) { commit({ ...current, sentenceIndex: chunkIndex.current, updatedAt: Date.now() }, 'paused'); return; }
    clearTimer();
    const usesChunkedSource = current.storageMode === 'chunked' && !current.speakableText;
    const persisted = usesChunkedSource ? persistedChunkFor(current) : undefined;
    const sourceText = current.speakableText ?? persisted?.text ?? current.text;
    const resolvedPreferences = resolveRuntimeSpeechPreferences(preferencesRef.current, current, voices, goldenProfileRef.current);
    const currentPreferences = resolvedPreferences.adaptiveListeningEnabled ? { ...resolvedPreferences, ...adaptiveChange(sourceText.slice(Math.max(0, current.currentCharacterOffset ?? 0), (current.currentCharacterOffset ?? 0) + 500), resolvedPreferences) } : resolvedPreferences;
    const chunks = processSpeechText(sourceText, currentPreferences, current.language);
    if (index >= chunks.length || chunks.length === 0) {
      if (usesChunkedSource) {
        const nextSequence = (current.currentChunkIndex ?? 0) + 1;
        if (persistedChunkFor(current, nextSequence)) {
          const next = { ...current, currentChunkIndex: nextSequence, sentenceIndex: 0, currentParagraphIndex: 0, currentCharacterOffset: 0, updatedAt: Date.now() };
          active.current = next; setItem(next); speak(0, session); return;
        }
        const info = getLargeDocumentInfo(current.id);
        if (info && !['ready', 'failed', 'needsOCR', 'paused'].includes(info.status)) {
          const waiting = { ...current, currentChunkIndex: nextSequence, sentenceIndex: 0, updatedAt: Date.now() };
          active.current = waiting; commit(waiting, 'ready'); timer.current = setTimeout(() => speak(0, session), 700); return;
        }
      }
      const complete = { ...current, sentenceIndex: Math.max(0, chunks.length - 1), progress: 1, completed: true, updatedAt: Date.now() };
      void recordCompletedDocument();
      commit(complete, 'completed'); return;
    }
    chunkIndex.current = Math.max(0, index);
    const position = positionForChunk(current, chunks[chunkIndex.current], chunks, persisted);
    const usableVoices = voices.filter((voice) => !unavailableVoiceIds.current.has(voice.identifier));
    const requestedVoice = currentPreferences.recommendedListening || currentPreferences.clearVoiceEnabled
      ? currentPreferences.voiceIdentifier ?? resolvedPreferences.voiceIdentifier
      : current.selectedVoice ?? currentPreferences.voiceIdentifier;
    const selectedVoice = validVoiceIdentifier(requestedVoice, usableVoices, current.language);
    const chunkCount = usesChunkedSource ? Math.max(1, getLargeDocumentInfo(current.id)?.processedUnits ?? getDocumentChunkCount(current.id)) : chunks.length;
    const next = { ...current, ...position, selectedVoice, progress: usesChunkedSource ? Math.min(1, ((current.currentChunkIndex ?? 0) + chunkIndex.current / Math.max(1, chunks.length)) / chunkCount) : chunks.length ? chunkIndex.current / chunks.length : 0, updatedAt: Date.now() };
    commit(next, 'playing');
    void recordListening(chunks[chunkIndex.current].text.trim().split(/\s+/).filter(Boolean).length, chunks[chunkIndex.current].text.trim().split(/\s+/).filter(Boolean).length * 0.42 / Math.max(0.1, currentPreferences.rate), currentPreferences.rate);
    const onDone = () => {
        speechActive.current = false;
        if (session !== speechSession.current || nativePausedSession.current === session) return;
        const freeUpdate = stopFreePlaybackMeter();
        if (freeUpdate?.reachedLimit || freePlaybackMeter.current.limitPending || !canStartFreePlayback()) {
          commit({ ...active.current!, sentenceIndex: chunkIndex.current, updatedAt: Date.now() }, 'paused');
          notifyFreeLimit();
          return;
        }
        const pause = chunks[chunkIndex.current]?.pauseAfterMs ?? 0;
        if (pause > 0) timer.current = setTimeout(() => speak(chunkIndex.current + 1, session), pause);
        else speak(chunkIndex.current + 1, session);
    };
    const speakChunk = (voice: string | undefined, mayRetryWithoutVoice: boolean) => {
      speechActive.current = true;
      const fullChunkText = chunks[chunkIndex.current].text;
      const offset = Math.min(Math.max(0, requestedOffset), Math.max(0, fullChunkText.length - 1));
      speechOffset.current = offset;
      Speech.speak(fullChunkText.slice(offset), {
        language: next.language, voice, rate: Math.min(2, Math.max(0.1, currentPreferences.rate)),
        pitch: Math.min(2, Math.max(0.5, currentPreferences.pitch)), volume: Math.min(1, Math.max(0, currentPreferences.volume)),
        onStart: () => { if (session === speechSession.current) startFreePlaybackMeter(session); },
        onBoundary: ({ charIndex }: { charIndex: number }) => { if (Platform.OS === 'android' && session === speechSession.current) speechOffset.current = offset + Math.max(0, charIndex); },
        onDone,
        onStopped: () => { if (session === speechSession.current) { speechActive.current = false; stopFreePlaybackMeter(); } },
        onError: () => {
          if (session !== speechSession.current) return;
          speechActive.current = false;
          stopFreePlaybackMeter();
          if (voice && mayRetryWithoutVoice) {
            unavailableVoiceIds.current.add(voice);
            setVoices((available) => available.filter((candidate) => candidate.identifier !== voice));
            speakChunk(undefined, false);
            return;
          }
          setState('error');
          showSpeechError();
        },
      });
    };
    speakChunk(selectedVoice, true);
  }, [canStartFreePlayback, clearTimer, commit, notifyFreeLimit, startFreePlaybackMeter, stopFreePlaybackMeter, voices]);

  const load = useCallback((next: LibraryItem, autoplay = false) => {
    const session = cancelSpeech();
    androidPausedPosition.current = null;
    const currentPreferences = preferencesRef.current;
    const effective = resolveRuntimeSpeechPreferences({ ...currentPreferences, modeId: next.selectedModeId ?? currentPreferences.modeId }, next, voices, goldenProfileRef.current);
    // A reviewed listening version is intentional user input. Keep it ahead of automatic
    // article cleanup so opening a saved item never overwrites their edits.
    const playableText = next.speakableText ?? (next.storageMode === 'chunked' ? undefined : next.type === 'article' || next.sourceType === 'url' ? removeArticleReferenceNoise(next.text) : next.cleanedText ?? next.text);
    const selectedVoice = validVoiceIdentifier(effective.recommendedListening || effective.clearVoiceEnabled ? effective.voiceIdentifier : currentPreferences.voiceIdentifier, voices, next.language);
    const resolved = { ...next, ...(playableText === undefined ? {} : { speakableText: playableText }), rate: effective.rate, pitch: effective.pitch, selectedVoice, completed: false, currentChunkIndex: next.storageMode === 'chunked' ? Math.max(0, next.currentChunkIndex ?? 0) : next.currentChunkIndex };
    largeChunkCache.current.clear(); active.current = resolved; chunkIndex.current = Math.max(0, next.sentenceIndex); setItem(resolved); setState('ready');
    if (autoplay) timer.current = setTimeout(() => speak(chunkIndex.current, session), 60);
  }, [cancelSpeech, speak, voices]);

  const play = useCallback(() => {
    if (!active.current) return;
    if (!canStartFreePlayback()) { commit({ ...active.current, sentenceIndex: chunkIndex.current, updatedAt: Date.now() }, 'paused'); return; }
    const androidResume = androidPausedPosition.current;
    if (androidResume && Platform.OS === 'android') {
      androidPausedPosition.current = null;
      const session = startSpeechSession();
      speak(androidResume.chunkIndex, session, androidResume.offset);
      return;
    }
    if (nativePausedSession.current === speechSession.current && (Platform.OS === 'ios' || Platform.OS === 'web')) {
      nativePausedSession.current = null;
      speechActive.current = true;
      setState('playing');
      startFreePlaybackMeter(speechSession.current);
      void Speech.resume().catch(() => {
        stopFreePlaybackMeter();
        const session = startSpeechSession();
        speak(chunkIndex.current, session);
      });
      return;
    }
    const session = startSpeechSession();
    speak(chunkIndex.current, session);
  }, [canStartFreePlayback, commit, speak, startFreePlaybackMeter, startSpeechSession, stopFreePlaybackMeter]);
  const pause = useCallback(() => {
    clearTimer();
    const session = speechSession.current;
    if (active.current && speechActive.current && Platform.OS === 'android') {
      const pausedPosition = { chunkIndex: chunkIndex.current, offset: speechOffset.current };
      cancelSpeech();
      androidPausedPosition.current = pausedPosition;
      nativePausedSession.current = null;
    } else if (active.current && speechActive.current && (Platform.OS === 'ios' || Platform.OS === 'web')) {
      nativePausedSession.current = session;
      // Native pause does not necessarily fire onStopped. Stop the Free meter
      // explicitly so wall-clock time is never charged while speech is paused.
      stopFreePlaybackMeter();
      setState('paused');
      void Speech.pause().catch(() => {
        if (nativePausedSession.current !== session || speechSession.current !== session) return;
        nativePausedSession.current = null;
        cancelSpeech();
      });
    } else {
      cancelSpeech();
      nativePausedSession.current = null;
    }
    if (active.current) {
      const pausedOffset = Platform.OS === 'android' ? androidPausedPosition.current?.offset ?? 0 : 0;
      commit({ ...active.current, sentenceIndex: chunkIndex.current, currentCharacterOffset: (active.current.currentCharacterOffset ?? 0) + pausedOffset, updatedAt: Date.now() }, 'paused');
    }
  }, [cancelSpeech, clearTimer, commit, stopFreePlaybackMeter]);
  const jump = useCallback((delta: number) => { if (!canStartFreePlayback()) return; const session = cancelSpeech(); speak(Math.max(0, chunkIndex.current + delta), session); }, [canStartFreePlayback, cancelSpeech, speak]);
  const jumpToSection = useCallback((sectionIndex: number) => {
    const current = active.current;
    if (!current || current.storageMode === 'chunked') return false;
    const section = current.sections?.[sectionIndex];
    if (!section || !canStartFreePlayback()) return false;
    const source = speechSourceFor(current);
    const sections = current.sections ?? [];
    let cursor = 0;
    let offset = -1;
    for (let index = 0; index <= sectionIndex; index += 1) {
      const candidate = sections[index];
      const probes = [candidate?.text.trim(), candidate?.title?.trim()].filter((probe): probe is string => Boolean(probe));
      const match = probes.map((probe) => ({ probe, index: source.indexOf(probe, cursor) })).filter((entry) => entry.index >= 0).sort((left, right) => left.index - right.index)[0];
      if (!match) return false;
      if (index === sectionIndex) offset = match.index;
      cursor = match.index + Math.max(1, match.probe.length);
    }
    if (offset < 0) return false;
    const resolvedPreferences = resolveRuntimeSpeechPreferences(preferencesRef.current, current, voices, goldenProfileRef.current);
    const chunks = processSpeechText(source, resolvedPreferences, current.language);
    const target = processSpeechText(source.slice(0, offset), resolvedPreferences, current.language).length;
    if (!chunks.length || target >= chunks.length) return false;
    const session = cancelSpeech();
    speak(target, session);
    return true;
  }, [canStartFreePlayback, cancelSpeech, speak, speechSourceFor, voices]);
  const jumpToChunk = useCallback((sequence: number) => {
    const current = active.current; if (!current || current.storageMode !== 'chunked' || current.speakableText) return;
    const session = cancelSpeech(); const next = { ...current, currentChunkIndex: Math.max(0, sequence), sentenceIndex: 0, currentParagraphIndex: 0, currentCharacterOffset: 0, updatedAt: Date.now() };
    active.current = next; chunkIndex.current = 0; setItem(next); speak(0, session);
  }, [cancelSpeech, speak]);
  /** Shared final seek path for the player navigation controls. It accepts a normalized
   * document position, resolves it to an existing sentence/chunk boundary, and restarts
   * speech once using the same playback path as the established jump controls. */
  const seekToNormalizedPosition = useCallback((normalizedPosition: number) => {
    const current = active.current;
    if (!current || !canStartFreePlayback()) return;
    const position = Math.max(0, Math.min(1, normalizedPosition));
    if (current.storageMode === 'chunked' && !current.speakableText) {
      const availableChunkCount = getDocumentChunkCount(current.id);
      if (!availableChunkCount) return;
      const targetSequence = Math.max(0, Math.min(availableChunkCount - 1, Math.round(position * Math.max(0, availableChunkCount - 1))));
      const session = cancelSpeech();
      const next = { ...current, currentChunkIndex: targetSequence, sentenceIndex: 0, currentParagraphIndex: 0, currentCharacterOffset: 0, updatedAt: Date.now() };
      active.current = next; chunkIndex.current = 0; setItem(next); speak(0, session);
      return;
    }
    const chunks = processSpeechText(speechSourceFor(current), resolveRuntimeSpeechPreferences(preferencesRef.current, current, voices, goldenProfileRef.current), current.language);
    const targetIndex = Math.max(0, Math.min(Math.max(0, chunks.length - 1), Math.round(position * Math.max(0, chunks.length - 1))));
    const session = cancelSpeech();
    speak(targetIndex, session);
  }, [canStartFreePlayback, cancelSpeech, speak, speechSourceFor, voices]);
  const updateSettings = useCallback((settings: Partial<SpeechPreferences>) => {
    if (!active.current) return;
    if (settings.voiceIdentifier) unavailableVoiceIds.current.delete(settings.voiceIdentifier);
    const rebuildRules = settings.recommendedListening !== undefined || settings.modeId !== undefined || settings.clearVoiceEnabled !== undefined || settings.podcastModeEnabled !== undefined || settings.smartFilteringEnabled !== undefined || settings.skipHeadings !== undefined || settings.skipUrls !== undefined || settings.skipCitations !== undefined || settings.skipConsecutiveDuplicates !== undefined || settings.skipLongNumbersAndCodes !== undefined || settings.skipReferenceSection !== undefined || settings.skipSiteBoilerplate !== undefined || settings.sentencePauseMs !== undefined || settings.paragraphPauseMs !== undefined || settings.headingPauseMs !== undefined;
    const previousChunks = rebuildRules ? processSpeechText(speechSourceFor(active.current), resolveRuntimeSpeechPreferences(preferencesRef.current, active.current, voices, goldenProfileRef.current), active.current.language) : [];
    preferencesRef.current = { ...preferencesRef.current, ...settings };
    const effective = resolveRuntimeSpeechPreferences(preferencesRef.current, active.current, voices, goldenProfileRef.current);
    const effectiveVoice = effective.recommendedListening || effective.clearVoiceEnabled ? effective.voiceIdentifier : preferencesRef.current.voiceIdentifier;
    const next = { ...active.current, rate: effective.rate, pitch: effective.pitch, selectedVoice: effectiveVoice, ...(settings.modeId === undefined ? {} : { selectedModeId: settings.modeId }), updatedAt: Date.now() };
    const wasPlaying = state === 'playing'; const session = cancelSpeech(); active.current = next;
    if (rebuildRules) {
      const rebuilt = processSpeechText(speechSourceFor(next), resolveRuntimeSpeechPreferences(preferencesRef.current, next, voices, goldenProfileRef.current), next.language);
      chunkIndex.current = remapSpeechChunkIndex(previousChunks, rebuilt, chunkIndex.current);
    }
    setItem(next); onProgress(next);
    if (wasPlaying) timer.current = setTimeout(() => speak(chunkIndex.current, session), 50);
  }, [cancelSpeech, onProgress, speak, speechSourceFor, state, voices]);

  /** Rebuilds sentence boundaries after Review Text saves, preserving the nearest spoken position. */
  const replaceListeningItem = useCallback((replacement: LibraryItem) => {
    const current = active.current;
    if (!current || current.id !== replacement.id) return;
    const previousChunks = processSpeechText(speechSourceFor(current), resolveRuntimeSpeechPreferences(preferencesRef.current, current, voices, goldenProfileRef.current), current.language);
    const next = { ...replacement, rate: current.rate, pitch: current.pitch, selectedVoice: current.selectedVoice, updatedAt: replacement.updatedAt };
    const rebuilt = processSpeechText(speechSourceFor(next), resolveRuntimeSpeechPreferences(preferencesRef.current, next, voices, goldenProfileRef.current), next.language);
    const nextIndex = Math.max(0, Math.min(Math.max(0, rebuilt.length - 1), remapSpeechChunkIndex(previousChunks, rebuilt, chunkIndex.current)));
    const wasPlaying = state === 'playing';
    const session = cancelSpeech();
    const positioned = { ...next, sentenceIndex: nextIndex, progress: rebuilt.length ? nextIndex / rebuilt.length : 0, currentCharacterOffset: rebuilt[nextIndex]?.characterOffset ?? 0, updatedAt: Date.now() };
    active.current = positioned;
    chunkIndex.current = nextIndex;
    setItem(positioned);
    onProgress(positioned);
    if (wasPlaying && rebuilt.length) timer.current = setTimeout(() => speak(nextIndex, session), 50);
  }, [cancelSpeech, onProgress, speak, speechSourceFor, state, voices]);

  const preview = useCallback((settings: Pick<SpeechPreferences, 'voiceIdentifier' | 'rate' | 'pitch' | 'volume'>, onFinished?: () => void) => {
    const wasPlaying = state === 'playing'; const resumeIndex = chunkIndex.current;
    const session = cancelSpeech();
    previewSession.current = { wasPlaying, resumeIndex, session, onFinished };
    speechActive.current = true;
    Speech.speak(previewText, { voice: settings.voiceIdentifier, rate: settings.rate, pitch: settings.pitch, volume: settings.volume, onDone: () => { speechActive.current = false; const preview = previewSession.current; previewSession.current = null; if (preview?.session !== speechSession.current) return; preview.onFinished?.(); if (preview.wasPlaying) speak(preview.resumeIndex, preview.session); }, onError: () => { speechActive.current = false; const preview = previewSession.current; previewSession.current = null; if (preview?.session !== speechSession.current) return; preview.onFinished?.(); if (preview.wasPlaying) speak(preview.resumeIndex, preview.session); } });
  }, [cancelSpeech, speak, state]);

  const stopPreview = useCallback(() => { const preview = previewSession.current; if (!preview) return; previewSession.current = null; const session = cancelSpeech(); if (preview.wasPlaying) timer.current = setTimeout(() => speak(preview.resumeIndex, session), 50); }, [cancelSpeech, speak]);

  const clear = useCallback(() => {
    previewSession.current = null;
    cancelSpeech();
    active.current = null;
    chunkIndex.current = 0;
    largeChunkCache.current.clear();
    setItem(null);
    setState('idle');
  }, [cancelSpeech]);

  const playText = useCallback((text: string, language = active.current?.language ?? 'en-US') => {
    if (!canStartFreePlayback()) return;
    const wasPlaying = state === 'playing'; const resumeIndex = chunkIndex.current; const current = active.current; const effective = resolveRuntimeSpeechPreferences(preferencesRef.current, current, voices, goldenProfileRef.current); const chunks = processSpeechText(text, effective, language); let index = 0; const session = cancelSpeech();
    const usableVoices = voices.filter((voice) => !unavailableVoiceIds.current.has(voice.identifier));
    const selectedVoice = validVoiceIdentifier(effective.recommendedListening || effective.clearVoiceEnabled ? effective.voiceIdentifier ?? getBestGoldenVoice(usableVoices, language, effective.voiceIdentifier)?.identifier : effective.voiceIdentifier, usableVoices, language);
    const speakTemporaryChunk = () => { if (session !== speechSession.current) return; const chunk = chunks[index]; if (!chunk) { if (wasPlaying) timer.current = setTimeout(() => speak(resumeIndex, session), 50); return; } if (!canStartFreePlayback()) return; speechActive.current = true; Speech.speak(chunk.text, { language, voice: selectedVoice, rate: effective.rate, pitch: effective.pitch, volume: effective.volume, onStart: () => { if (session === speechSession.current) startFreePlaybackMeter(session); }, onDone: () => { speechActive.current = false; if (session !== speechSession.current) return; const freeUpdate = stopFreePlaybackMeter(); if (freeUpdate?.reachedLimit || !canStartFreePlayback()) { notifyFreeLimit(); return; } index += 1; if (chunks[index - 1]?.pauseAfterMs) timer.current = setTimeout(speakTemporaryChunk, chunks[index - 1].pauseAfterMs); else speakTemporaryChunk(); }, onStopped: () => { if (session === speechSession.current) { speechActive.current = false; stopFreePlaybackMeter(); } }, onError: () => { speechActive.current = false; stopFreePlaybackMeter(); if (session === speechSession.current && wasPlaying) speak(resumeIndex, session); else if (session === speechSession.current) showSpeechError(); } }); };
    if (chunks.length) speakTemporaryChunk();
  }, [canStartFreePlayback, cancelSpeech, notifyFreeLimit, speak, startFreePlaybackMeter, state, stopFreePlaybackMeter, voices]);

  const playConversation = useCallback((turns: Array<{ speaker: string; text: string }>, language = active.current?.language ?? 'en-US') => {
    if (!canStartFreePlayback()) return;
    const wasPlaying = state === 'playing'; const resumeIndex = chunkIndex.current; let index = 0; const session = cancelSpeech(); const effective = resolveRuntimeSpeechPreferences(preferencesRef.current, active.current, voices, goldenProfileRef.current); const compatibleVoices = rankAvailableVoices(voices.filter((voice) => !unavailableVoiceIds.current.has(voice.identifier)), language, effective.voiceIdentifier);
    const speakTurn = () => { if (session !== speechSession.current) return; const turn = turns[index]; if (!turn) { if (wasPlaying) timer.current = setTimeout(() => speak(resumeIndex, session), 50); return; } if (!canStartFreePlayback()) return; const voice = validVoiceIdentifier(effective.recommendedListening || effective.clearVoiceEnabled ? effective.voiceIdentifier : compatibleVoices[index % Math.max(1, compatibleVoices.length)]?.identifier, voices, language); Speech.speak(turn.text, { language, voice, rate: effective.rate, pitch: effective.pitch, volume: effective.volume, onStart: () => { if (session === speechSession.current) startFreePlaybackMeter(session); }, onDone: () => { if (session !== speechSession.current) return; const freeUpdate = stopFreePlaybackMeter(); if (freeUpdate?.reachedLimit || !canStartFreePlayback()) { notifyFreeLimit(); return; } index += 1; speakTurn(); }, onStopped: () => { if (session === speechSession.current) stopFreePlaybackMeter(); }, onError: () => { stopFreePlaybackMeter(); if (wasPlaying) speak(resumeIndex, session); else showSpeechError(); } }); };
    if (turns.length) speakTurn();
  }, [canStartFreePlayback, cancelSpeech, notifyFreeLimit, speak, startFreePlaybackMeter, state, stopFreePlaybackMeter, voices]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') checkpointFreePlayback();
    });
    return () => subscription.remove();
  }, [checkpointFreePlayback]);

  const sentences = useMemo(() => item ? processSpeechText(speechSourceFor(item), resolveRuntimeSpeechPreferences(preferences, item, voices, goldenProfile), item.language).map((chunk) => chunk.text) : [], [item, preferences, voices, goldenProfile, speechSourceFor]);
  const chapterTitle = item?.storageMode === 'chunked' ? persistedChunkFor(item)?.sectionTitle : undefined;
  return { item, state, voices, load, clear, play, pause, jump, jumpToChunk, jumpToSection, seekToNormalizedPosition, updateSettings, replaceListeningItem, preview, stopPreview, playText, playConversation, sentences, chapterTitle };
}
