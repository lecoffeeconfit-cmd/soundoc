import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { processSpeechText, type SpeakableChunk } from '../lib/speechText';
import { previewText } from '../lib/speechPreview';
import { resolveSpeechPreferences } from '../lib/listeningModes';
import { adaptiveChange } from '../lib/documentIntelligence';
import { recordCompletedDocument, recordListening } from '../lib/analytics';
import { removeArticleReferenceNoise } from '../lib/text';
import type { LibraryItem, PlayerState, SpeechPreferences, Voice } from '../types';

const fallbackPreferences: SpeechPreferences = {
  presetId: 'natural', modeId: 'natural', rate: 1, pitch: 1, volume: 1, sentencePauseMs: 300, paragraphPauseMs: 650,
  pronunciationRules: [], skipHeadings: false, skipUrls: false, skipCitations: false,
  skipConsecutiveDuplicates: true, favoriteVoiceIds: [], recentVoiceIds: [], adaptiveListeningEnabled: false, skipLongNumbersAndCodes: true,
};

export function useSpeechPlayer(onProgress: (item: LibraryItem) => void, preferences: SpeechPreferences = fallbackPreferences) {
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [state, setState] = useState<PlayerState>('idle');
  const [voices, setVoices] = useState<Voice[]>([]);
  const chunkIndex = useRef(0);
  const active = useRef<LibraryItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSession = useRef<{ wasPlaying: boolean; resumeIndex: number; session: number } | null>(null);
  const speechSession = useRef(0);
  const nativePausedSession = useRef<number | null>(null);
  const speechActive = useRef(false);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  useEffect(() => {
    Speech.getAvailableVoicesAsync().then((available) => setVoices(available.map((voice) => ({
      identifier: voice.identifier, name: voice.name || voice.identifier, language: voice.language,
      quality: voice.quality,
    })))).catch(() => setVoices([]));
    return () => { if (timer.current) clearTimeout(timer.current); void Speech.stop(); };
  }, []);

  const clearTimer = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  const startSpeechSession = useCallback(() => {
    const session = ++speechSession.current;
    clearTimer();
    nativePausedSession.current = null;
    speechActive.current = false;
    return session;
  }, [clearTimer]);
  const cancelSpeech = useCallback(() => {
    const session = startSpeechSession();
    void Speech.stop();
    return session;
  }, [startSpeechSession]);
  const commit = useCallback((next: LibraryItem, status?: PlayerState) => {
    const now = Date.now(); const enriched = { ...next, lastOpenedAt: now, ...(status === 'completed' ? { completedAt: now } : {}) };
    active.current = enriched; setItem(enriched); onProgress(enriched); if (status) setState(status);
  }, [onProgress]);

  const positionForChunk = useCallback((current: LibraryItem, chunk: SpeakableChunk, chunks: SpeakableChunk[]) => {
    const chunkPosition = Math.max(0, chunks.indexOf(chunk));
    const sectionIndex = current.sections?.length ? Math.min(current.sections.length - 1, Math.floor((chunkPosition / Math.max(1, chunks.length)) * current.sections.length)) : -1;
    const section = sectionIndex >= 0 ? current.sections?.[sectionIndex] : undefined;
    const characterOffset = chunks.slice(0, chunkPosition).reduce((total, candidate) => total + candidate.text.length + 1, 0) + chunk.characterOffset;
    return { currentSectionId: section?.id, currentParagraphIndex: chunk.paragraphIndex, currentCharacterOffset: characterOffset, sentenceIndex: chunkPosition };
  }, []);

  const speak = useCallback((index: number, session = speechSession.current) => {
    if (session !== speechSession.current) return;
    const current = active.current;
    if (!current) return;
    clearTimer();
    const resolvedPreferences = resolveSpeechPreferences(preferencesRef.current, current);
    const currentPreferences = resolvedPreferences.adaptiveListeningEnabled ? { ...resolvedPreferences, ...adaptiveChange(current.text.slice(Math.max(0, current.currentCharacterOffset ?? 0), (current.currentCharacterOffset ?? 0) + 500), resolvedPreferences) } : resolvedPreferences;
    const chunks = processSpeechText(current.speakableText ?? current.text, currentPreferences, current.language);
    if (index >= chunks.length || chunks.length === 0) {
      const complete = { ...current, sentenceIndex: Math.max(0, chunks.length - 1), progress: 1, completed: true, updatedAt: Date.now() };
      void recordCompletedDocument();
      commit(complete, 'completed'); return;
    }
    chunkIndex.current = Math.max(0, index);
    const position = positionForChunk(current, chunks[chunkIndex.current], chunks);
    const next = { ...current, ...position, progress: chunks.length ? chunkIndex.current / chunks.length : 0, updatedAt: Date.now() };
    commit(next, 'playing');
    void recordListening(chunks[chunkIndex.current].text.trim().split(/\s+/).filter(Boolean).length, chunks[chunkIndex.current].text.trim().split(/\s+/).filter(Boolean).length * 0.42 / Math.max(0.1, currentPreferences.rate), currentPreferences.rate);
    const selectedVoice = next.selectedVoice && voices.some((voice) => voice.identifier === next.selectedVoice) ? next.selectedVoice : undefined;
    speechActive.current = true;
    Speech.speak(chunks[chunkIndex.current].text, {
      language: next.language, voice: selectedVoice, rate: Math.min(2, Math.max(0.1, currentPreferences.rate)),
      pitch: Math.min(2, Math.max(0.5, currentPreferences.pitch)), volume: Math.min(1, Math.max(0, currentPreferences.volume)),
      onDone: () => {
        speechActive.current = false;
        if (session !== speechSession.current || nativePausedSession.current === session) return;
        const pause = chunks[chunkIndex.current]?.pauseAfterMs ?? 0;
        if (pause > 0) timer.current = setTimeout(() => speak(chunkIndex.current + 1, session), pause);
        else speak(chunkIndex.current + 1, session);
      },
      onStopped: () => { if (session === speechSession.current) speechActive.current = false; },
      onError: () => { if (session === speechSession.current) { speechActive.current = false; setState('error'); } },
    });
  }, [clearTimer, commit, voices]);

  const load = useCallback((next: LibraryItem, autoplay = false) => {
    const session = cancelSpeech();
    const currentPreferences = preferencesRef.current;
    const effective = resolveSpeechPreferences({ ...currentPreferences, modeId: next.selectedModeId ?? currentPreferences.modeId }, next);
    const playableText = next.type === 'article' || next.sourceType === 'url' ? removeArticleReferenceNoise(next.text) : next.text;
    const resolved = { ...next, speakableText: playableText, rate: effective.rate, pitch: effective.pitch, selectedVoice: currentPreferences.voiceIdentifier, completed: false };
    active.current = resolved; chunkIndex.current = Math.max(0, next.currentCharacterOffset === undefined ? next.sentenceIndex : next.sentenceIndex); setItem(resolved); setState('ready');
    if (autoplay) timer.current = setTimeout(() => speak(chunkIndex.current, session), 60);
  }, [cancelSpeech, onProgress, speak]);

  const play = useCallback(() => {
    if (!active.current) return;
    if (nativePausedSession.current === speechSession.current && (Platform.OS === 'ios' || Platform.OS === 'web')) {
      nativePausedSession.current = null;
      speechActive.current = true;
      setState('playing');
      void Speech.resume().catch(() => {
        const session = startSpeechSession();
        speak(chunkIndex.current, session);
      });
      return;
    }
    const session = startSpeechSession();
    speak(chunkIndex.current, session);
  }, [speak, startSpeechSession]);
  const pause = useCallback(() => {
    clearTimer();
    const session = speechSession.current;
    if (active.current && speechActive.current && (Platform.OS === 'ios' || Platform.OS === 'web')) {
      nativePausedSession.current = session;
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
    if (active.current) commit({ ...active.current, sentenceIndex: chunkIndex.current, updatedAt: Date.now() }, 'paused');
  }, [cancelSpeech, clearTimer, commit]);
  const jump = useCallback((delta: number) => { const session = cancelSpeech(); speak(Math.max(0, chunkIndex.current + delta), session); }, [cancelSpeech, speak]);
  const updateSettings = useCallback((settings: Partial<SpeechPreferences>) => {
    if (!active.current) return;
    const rebuildRules = settings.skipHeadings !== undefined || settings.skipUrls !== undefined || settings.skipCitations !== undefined || settings.skipConsecutiveDuplicates !== undefined || settings.skipLongNumbersAndCodes !== undefined;
    const previousChunks = rebuildRules ? processSpeechText(active.current.speakableText ?? active.current.text, resolveSpeechPreferences(preferencesRef.current, active.current), active.current.language) : [];
    const anchor = previousChunks[chunkIndex.current]?.text.slice(0, 80).trim();
    preferencesRef.current = { ...preferencesRef.current, ...settings };
    const next = { ...active.current, ...(settings.rate === undefined ? {} : { rate: settings.rate }), ...(settings.pitch === undefined ? {} : { pitch: settings.pitch }), ...(settings.modeId === undefined ? {} : { selectedModeId: settings.modeId }), ...(Object.prototype.hasOwnProperty.call(settings, 'voiceIdentifier') ? { selectedVoice: settings.voiceIdentifier } : {}), updatedAt: Date.now() };
    const wasPlaying = state === 'playing'; const session = cancelSpeech(); active.current = next;
    if (rebuildRules && anchor) { const rebuilt = processSpeechText(next.speakableText ?? next.text, resolveSpeechPreferences(preferencesRef.current, next), next.language); const match = rebuilt.findIndex((chunk) => chunk.text.includes(anchor) || anchor.includes(chunk.text.slice(0, Math.min(80, chunk.text.length)))); if (match >= 0) chunkIndex.current = match; }
    setItem(next); onProgress(next);
    if (wasPlaying) timer.current = setTimeout(() => speak(chunkIndex.current, session), 50);
  }, [cancelSpeech, onProgress, speak, state]);

  const preview = useCallback((settings: Pick<SpeechPreferences, 'voiceIdentifier' | 'rate' | 'pitch' | 'volume'>) => {
    const wasPlaying = state === 'playing'; const resumeIndex = chunkIndex.current;
    const session = cancelSpeech();
    previewSession.current = { wasPlaying, resumeIndex, session };
    speechActive.current = true;
    Speech.speak(previewText, { voice: settings.voiceIdentifier, rate: settings.rate, pitch: settings.pitch, volume: settings.volume, onDone: () => { speechActive.current = false; const preview = previewSession.current; previewSession.current = null; if (preview?.session === speechSession.current && preview.wasPlaying) speak(preview.resumeIndex, preview.session); } });
  }, [cancelSpeech, speak, state]);

  const stopPreview = useCallback(() => { const preview = previewSession.current; if (!preview) return; previewSession.current = null; const session = cancelSpeech(); if (preview.wasPlaying) timer.current = setTimeout(() => speak(preview.resumeIndex, session), 50); }, [cancelSpeech, speak]);

  const playText = useCallback((text: string, language = active.current?.language ?? 'en-US') => {
    const wasPlaying = state === 'playing'; const resumeIndex = chunkIndex.current; const current = active.current; const effective = resolveSpeechPreferences(preferencesRef.current, current); const chunks = processSpeechText(text, effective, language); let index = 0; const session = cancelSpeech();
    const speakTemporaryChunk = () => { if (session !== speechSession.current) return; const chunk = chunks[index]; if (!chunk) { if (wasPlaying) timer.current = setTimeout(() => speak(resumeIndex, session), 50); return; } speechActive.current = true; Speech.speak(chunk.text, { language, voice: effective.voiceIdentifier, rate: effective.rate, pitch: effective.pitch, volume: effective.volume, onDone: () => { speechActive.current = false; if (session !== speechSession.current) return; index += 1; if (chunks[index - 1]?.pauseAfterMs) timer.current = setTimeout(speakTemporaryChunk, chunks[index - 1].pauseAfterMs); else speakTemporaryChunk(); }, onError: () => { speechActive.current = false; if (session === speechSession.current && wasPlaying) speak(resumeIndex, session); } }); };
    if (chunks.length) speakTemporaryChunk();
  }, [cancelSpeech, speak, state]);

  const playConversation = useCallback((turns: Array<{ speaker: string; text: string }>, language = active.current?.language ?? 'en-US') => {
    const wasPlaying = state === 'playing'; const resumeIndex = chunkIndex.current; let index = 0; const session = cancelSpeech();
    const speakTurn = () => { if (session !== speechSession.current) return; const turn = turns[index]; if (!turn) { if (wasPlaying) timer.current = setTimeout(() => speak(resumeIndex, session), 50); return; } const voice = voices[index % Math.max(1, voices.length)]?.identifier; Speech.speak(turn.text, { language, voice, rate: preferencesRef.current.rate, pitch: preferencesRef.current.pitch, volume: preferencesRef.current.volume, onDone: () => { index += 1; speakTurn(); }, onError: () => { if (wasPlaying) speak(resumeIndex, session); } }); };
    if (turns.length) speakTurn();
  }, [cancelSpeech, speak, state, voices]);

  const sentences = useMemo(() => item ? processSpeechText(item.speakableText ?? item.text, resolveSpeechPreferences(preferences, item), item.language).map((chunk) => chunk.text) : [], [item, preferences]);
  return { item, state, voices, load, play, pause, jump, updateSettings, preview, stopPreview, playText, playConversation, sentences };
}
