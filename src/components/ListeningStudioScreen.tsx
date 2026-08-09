import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, space, type } from '../lib/theme';
import type { SpeechPreferences, Voice } from '../types';
import { pauseLevelFromPreferences, speechSettingsForPauseLevel, speechSettingsForStudioPreset, studioSettingsFromPreferences, listeningStudioPresets, type ListeningStudioPresetId } from '../lib/listeningStudio';
import { MixerChannel } from './MixerChannel';
import { SoundocToggle } from './SoundocToggle';

type Props = {
  visible: boolean;
  preferences: SpeechPreferences;
  voices: Voice[];
  selectedVoice?: string;
  playing: boolean;
  reduceMotion?: boolean;
  onClose: () => void;
  onUpdateSettings: (settings: Partial<SpeechPreferences>) => void;
  onOpenVoicePicker: () => void;
};

export function ListeningStudioModal({ visible, preferences, voices, selectedVoice, playing, reduceMotion = false, onClose, onUpdateSettings, onOpenVoicePicker }: Props) {
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const [focusedPreset, setFocusedPreset] = useState<ListeningStudioPresetId | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setSystemReduceMotion(enabled); });
    return () => { mounted = false; };
  }, []);
  const studio = studioSettingsFromPreferences(preferences);
  const reducedMotion = reduceMotion || systemReduceMotion;
  useEffect(() => {
    if (reducedMotion) { reveal.setValue(studio.enabled ? 1 : 0); return; }
    Animated.timing(reveal, { toValue: studio.enabled ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [reducedMotion, reveal, studio.enabled]);
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={styles.screen}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.kicker}>SOUNDoc / MIX</Text><Text style={styles.title}>Listening Studio</Text><Text style={styles.description}>Shape the voice, pacing, pauses, and background sound.</Text></View><Pressable onPress={onClose} accessibilityLabel="Close Listening Studio" hitSlop={10}><Text style={styles.done}>Done</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.toggleCard}><View style={styles.copy}><Text style={styles.cardTitle}>Listening Studio</Text><Text style={styles.cardDescription}>Turn on the mixer when you want more control. Standard playback stays unchanged while it is off.</Text></View><SoundocToggle value={studio.enabled} onValueChange={(enabled) => onUpdateSettings({ listeningStudioEnabled: enabled })} compact accessibilityLabel="Listening Studio" /></View>
        <Animated.View style={[styles.reveal, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
          <PlaybackLevelMeter playing={playing && studio.enabled} reducedMotion={reducedMotion} />
          <Text style={styles.sectionLabel}>PRESETS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
            {listeningStudioPresets.map((preset) => <Pressable key={preset.id} disabled={!studio.enabled || preset.id === 'custom'} onPress={() => { setFocusedPreset(preset.id); if (preset.id !== 'custom') onUpdateSettings(speechSettingsForStudioPreset(preset.id)); }} style={[styles.preset, studio.preset === preset.id && styles.presetSelected]} accessibilityRole="button" accessibilityLabel={`${preset.label} preset${preset.id === 'custom' ? ', selected automatically after manual changes' : ''}`}><Text style={[styles.presetIcon, studio.preset === preset.id && styles.presetTextSelected]}>{preset.icon}</Text><Text style={[styles.presetText, studio.preset === preset.id && styles.presetTextSelected]}>{preset.label}</Text></Pressable>)}
          </ScrollView>
          <View style={styles.mixerCard}><View style={styles.mixerTop}><View><Text style={styles.mixerTitle}>Shape the sound</Text><Text style={styles.mixerSubtitle}>Drag a channel to tune it. Changes apply to narration.</Text></View><Text style={styles.mixerStatus}>{focusedPreset ? 'UPDATED' : studio.enabled ? 'ACTIVE' : 'STANDBY'}</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.channelsScroll} accessibilityLabel="Listening Studio mixer">
              <MixerChannel icon="◉" label="Voice" value={50} min={0} max={100} step={1} formatValue={() => voices.find((voice) => voice.identifier === selectedVoice)?.name?.split(' ')[0] ?? 'Auto'} secondary={voices.length ? 'tap to choose' : 'Unavailable'} disabled={!studio.enabled || voices.length === 0} adjustable={false} onChange={() => {}} onPressHeader={onOpenVoicePicker} />
              <MixerChannel icon="»" label="Speed" value={preferences.rate} min={0.75} max={2} step={0.05} formatValue={(value) => `${value.toFixed(2)}×`} disabled={!studio.enabled} onChange={() => {}} onChangeEnd={(value) => { setFocusedPreset('custom'); onUpdateSettings({ rate: value, listeningStudioPreset: 'custom' }); setFocusedPreset(null); }} />
              <MixerChannel icon="∿" label="Pitch" value={preferences.pitch} min={0.8} max={1.2} step={0.01} formatValue={(value) => value.toFixed(2)} secondary="TTS" disabled={!studio.enabled} onChange={() => {}} onChangeEnd={(value) => { setFocusedPreset('custom'); onUpdateSettings({ pitch: value, listeningStudioPreset: 'custom' }); setFocusedPreset(null); }} />
              <MixerChannel icon="⋮" label="Pauses" value={pauseLevelFromPreferences(preferences)} min={0} max={100} step={1} formatValue={(value) => `${Math.round(value)}%`} secondary="spacing" disabled={!studio.enabled} onChange={() => {}} onChangeEnd={(value) => { setFocusedPreset('custom'); onUpdateSettings({ ...speechSettingsForPauseLevel(value), listeningStudioPreset: 'custom' }); setFocusedPreset(null); }} />
              <MixerChannel icon="▮" label="Narration" value={preferences.volume * 100} min={0} max={100} step={1} formatValue={(value) => `${Math.round(value)}%`} secondary="voice level" disabled={!studio.enabled} onChange={() => {}} onChangeEnd={(value) => { setFocusedPreset('custom'); onUpdateSettings({ volume: value / 100, listeningStudioPreset: 'custom' }); setFocusedPreset(null); }} />
              <MixerChannel icon="≈" label="Ambience" value={0} min={0} max={100} step={1} formatValue={() => 'OFF'} secondary="No audio" disabled onChange={() => {}} />
            </ScrollView>
            <Text style={styles.mixerFootnote}>Pitch is handled by the current system voice provider. Ambience is reserved for a future audio engine and is intentionally unavailable.</Text>
          </View>
        </Animated.View>
        {!studio.enabled && <View style={styles.offHint}><Text style={styles.offHintIcon}>◌</Text><Text style={styles.offHintText}>The mixer is on standby. Your regular Soundoc narration remains in control.</Text></View>}
      </ScrollView>
    </View>
  </Modal>;
}

function PlaybackLevelMeter({ playing, reducedMotion }: { playing: boolean; reducedMotion: boolean }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (!playing || reducedMotion) { pulse.stopAnimation(); pulse.setValue(0.35); return; }
    const animation = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.35, duration: 750, useNativeDriver: true })]));
    animation.start();
    return () => animation.stop();
  }, [playing, pulse, reducedMotion]);
  return <View style={styles.meterCard}><View style={styles.meterHeader}><Text style={styles.sectionLabel}>NARRATION ACTIVITY</Text><Text style={styles.meterNote}>{playing ? 'PLAYING' : 'PAUSED'} · visual activity only</Text></View><View style={styles.meter}>{Array.from({ length: 18 }, (_, index) => <Animated.View key={index} style={[styles.meterBar, { height: 8 + ((index * 7) % 5) * 4, opacity: playing ? pulse : 0.32, transform: [{ scaleY: playing ? pulse : 1 }] }, index > 12 && styles.meterBarWarm]} />)}</View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundPrimary },
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  headerCopy: { flex: 1 },
  kicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1.1 },
  title: { ...type.display, color: colors.textPrimary, fontSize: 30, lineHeight: 36, marginTop: 4 },
  description: { ...type.body, color: colors.textSecondary, marginTop: 4, maxWidth: 300 },
  done: { ...type.label, color: colors.accentPrimary, padding: space.xs },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md },
  toggleCard: { minHeight: 104, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle, flexDirection: 'row', alignItems: 'center', gap: space.md, ...shadows.raised },
  copy: { flex: 1 },
  cardTitle: { ...type.heading, color: colors.textPrimary },
  cardDescription: { ...type.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  reveal: { gap: space.md },
  sectionLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 1, fontSize: 10 },
  presetRow: { gap: space.xs, paddingVertical: 1 },
  preset: { minHeight: 48, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle, flexDirection: 'row', alignItems: 'center', gap: 6 },
  presetSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentPrimary },
  presetIcon: { color: colors.textTertiary, fontSize: 14 },
  presetText: { ...type.caption, color: colors.textSecondary },
  presetTextSelected: { color: colors.accentPrimary },
  mixerCard: { padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.76)', ...shadows.raised },
  mixerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm, marginBottom: space.md },
  mixerTitle: { ...type.heading, color: colors.textPrimary },
  mixerSubtitle: { ...type.caption, color: colors.textSecondary, marginTop: 3 },
  mixerStatus: { ...type.caption, color: colors.accentPrimary, letterSpacing: 0.7 },
  channelsScroll: { gap: space.sm, paddingHorizontal: 2, paddingBottom: space.xs },
  mixerFootnote: { ...type.caption, color: colors.textTertiary, lineHeight: 17, marginTop: space.sm },
  meterCard: { padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', borderBottomColor: 'rgba(0,0,0,0.72)' },
  meterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meterNote: { ...type.caption, color: colors.textTertiary, fontSize: 10 },
  meter: { height: 42, marginTop: space.sm, flexDirection: 'row', alignItems: 'center', gap: 3 },
  meterBar: { flex: 1, minWidth: 3, borderRadius: 3, backgroundColor: colors.accentPrimary },
  meterBarWarm: { backgroundColor: colors.warning },
  offHint: { padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  offHintIcon: { color: colors.textTertiary, fontSize: 20 },
  offHintText: { ...type.caption, color: colors.textTertiary, flex: 1, lineHeight: 18 },
});
