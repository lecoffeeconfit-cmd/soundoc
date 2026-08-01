import * as Speech from 'expo-speech';
import type { SpeechPreferences } from '../types';

export const previewText = 'Soundoc turns your saved text into a clear and personalized listening experience.';

export async function previewVoice(preferences: Pick<SpeechPreferences, 'voiceIdentifier' | 'rate' | 'pitch' | 'volume'>) {
  await Speech.stop();
  Speech.speak(previewText, {
    voice: preferences.voiceIdentifier,
    rate: preferences.rate,
    pitch: preferences.pitch,
    volume: preferences.volume,
  });
}
