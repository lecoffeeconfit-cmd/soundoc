import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { segmentSentences } from '../lib/text';
import type { LibraryItem, PlayerState, Voice } from '../types';

export function useSpeechPlayer(onProgress: (item: LibraryItem) => void) {
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [state, setState] = useState<PlayerState>('idle');
  const [voices, setVoices] = useState<Voice[]>([]);
  const sentenceIndex = useRef(0);
  const active = useRef<LibraryItem | null>(null);

  useEffect(() => {
    Speech.getAvailableVoicesAsync().then((available) => setVoices(available.map((voice) => ({
      identifier: voice.identifier, name: voice.name || voice.identifier, language: voice.language,
      quality: voice.quality,
    })))).catch(() => setVoices([]));
    return () => { void Speech.stop(); };
  }, []);

  const commit = useCallback((next: LibraryItem, status?: PlayerState) => {
    active.current = next; setItem(next); onProgress(next); if (status) setState(status);
  }, [onProgress]);

  const speak = useCallback((index: number) => {
    const current = active.current;
    if (!current) return;
    const sentences = segmentSentences(current.text, current.language);
    if (index >= sentences.length) {
      const complete = { ...current, sentenceIndex: Math.max(0, sentences.length - 1), progress: 1, completed: true, updatedAt: Date.now() };
      commit(complete, 'completed'); return;
    }
    sentenceIndex.current = Math.max(0, index);
    const next = { ...current, sentenceIndex: sentenceIndex.current, progress: sentences.length ? sentenceIndex.current / sentences.length : 0, updatedAt: Date.now() };
    commit(next, 'playing');
    Speech.speak(sentences[sentenceIndex.current], {
      language: next.language, voice: next.selectedVoice, rate: Math.min(1, Math.max(0.1, 0.5 * next.rate)),
      pitch: next.pitch,
      onDone: () => speak(sentenceIndex.current + 1),
      onError: () => setState('error'),
    });
  }, [commit]);

  const load = useCallback((next: LibraryItem, autoplay = false) => {
    Speech.stop(); active.current = next; sentenceIndex.current = next.sentenceIndex; setItem(next); setState('ready');
    if (autoplay) setTimeout(() => speak(next.sentenceIndex), 60);
  }, [speak]);
  const play = useCallback(() => { if (active.current) speak(sentenceIndex.current); }, [speak]);
  const pause = useCallback(() => {
    Speech.stop();
    if (active.current) commit({ ...active.current, sentenceIndex: sentenceIndex.current, updatedAt: Date.now() }, 'paused');
  }, [commit]);
  const jump = useCallback((delta: number) => { Speech.stop(); speak(Math.max(0, sentenceIndex.current + delta)); }, [speak]);
  const updateSettings = useCallback((settings: Partial<Pick<LibraryItem, 'rate' | 'pitch' | 'selectedVoice'>>) => {
    if (!active.current) return;
    const next = { ...active.current, ...settings, updatedAt: Date.now() };
    const wasPlaying = state === 'playing'; Speech.stop(); active.current = next; setItem(next); onProgress(next);
    if (wasPlaying) setTimeout(() => speak(sentenceIndex.current), 40);
  }, [onProgress, speak, state]);

  return { item, state, voices, load, play, pause, jump, updateSettings, sentences: useMemo(() => item ? segmentSentences(item.text, item.language) : [], [item]) };
}
