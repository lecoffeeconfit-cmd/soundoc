import * as Speech from 'expo-speech';
import type { SpeechPreferences } from '../types';

export const previewText = 'Soundoc chooses a clear voice, a comfortable pace, and natural breathing room. Each idea has space to land, so dense reading is easier to follow.';

export async function previewVoice(preferences: Pick<SpeechPreferences, 'voiceIdentifier' | 'rate' | 'pitch' | 'volume'>) {
  await Speech.stop();
  Speech.speak(previewText, {
    voice: preferences.voiceIdentifier,
    rate: preferences.rate,
    pitch: preferences.pitch,
    volume: preferences.volume,
  });
}
