import * as Speech from 'expo-speech';
import type { SpeechPreferences } from '../types';

export const previewText = 'Soundoc adjusts the voice, pacing, and pauses to create a clear and comfortable listening experience.';

export async function previewVoice(preferences: Pick<SpeechPreferences, 'voiceIdentifier' | 'rate' | 'pitch' | 'volume'>) {
  await Speech.stop();
  Speech.speak(previewText, {
    voice: preferences.voiceIdentifier,
    rate: preferences.rate,
    pitch: preferences.pitch,
    volume: preferences.volume,
  });
}
