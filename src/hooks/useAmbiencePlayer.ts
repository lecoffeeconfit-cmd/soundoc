import { useEffect, useRef } from 'react';
import type { AudioPlayer } from 'expo-audio';
import type { AmbienceType } from '../lib/listeningStudio';

const AMBIENCE_SOURCES: Record<Exclude<AmbienceType, 'none'>, number> = {
  rain: require('../../assets/ambience/rain.wav'),
  cafe: require('../../assets/ambience/cafe.wav'),
  'brown-noise': require('../../assets/ambience/brown-noise.wav'),
  'white-noise': require('../../assets/ambience/white-noise.wav'),
  fireplace: require('../../assets/ambience/fireplace.wav'),
  nature: require('../../assets/ambience/nature.wav'),
};

type Options = {
  enabled: boolean;
  playing: boolean;
  type: AmbienceType;
  volume: number;
};

function safelyPause(player: AudioPlayer | null) {
  try { player?.pause(); } catch { /* The native player may already be gone during teardown. */ }
}

function safelyRemove(player: AudioPlayer | null) {
  try { player?.remove(); } catch { /* The native player may already be gone during teardown. */ }
}

export function useAmbiencePlayer({ enabled, playing, type, volume }: Options) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const audioModuleRef = useRef<Promise<typeof import('expo-audio')> | null>(null);
  const source = type === 'none' ? null : AMBIENCE_SOURCES[type];

  useEffect(() => {
    const previousPlayer = playerRef.current;
    safelyPause(previousPlayer);
    safelyRemove(previousPlayer);
    playerRef.current = null;

    if (!enabled || source === null) return undefined;

    let cancelled = false;
    const audioModule = audioModuleRef.current ?? import('expo-audio');
    audioModuleRef.current = audioModule;
    void audioModule.then(({ createAudioPlayer, setAudioModeAsync }) => {
      if (cancelled) return;
      const player = createAudioPlayer(source, { downloadFirst: true });
      player.loop = true;
      playerRef.current = player;
      void setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: true,
      }).catch(() => undefined);
    }).catch(() => {
      // The optional audio native module may not exist in an older installed build.
      // Keep ordinary Soundoc playback usable until a rebuild includes expo-audio.
      audioModuleRef.current = null;
    });

    return () => {
      cancelled = true;
      safelyPause(playerRef.current);
      safelyRemove(playerRef.current);
      playerRef.current = null;
    };
  }, [enabled, source]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const safeVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    player.volume = safeVolume;
    if (enabled && playing && type !== 'none' && safeVolume > 0) player.play();
    else player.pause();
  }, [enabled, playing, type, volume, source]);

  useEffect(() => () => {
    safelyPause(playerRef.current);
    safelyRemove(playerRef.current);
    playerRef.current = null;
  }, []);
}
