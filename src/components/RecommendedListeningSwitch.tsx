import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { colors, radius, shadows, space, type } from '../lib/theme';

type Props = {
  enabled: boolean;
  clearMode?: boolean;
  classification: string;
  integrated?: boolean;
  reduceEffects?: boolean;
  onValueChange: (value: boolean) => void;
  onOpenInspector?: () => void;
  onPreview?: (onFinished?: () => void) => void;
  onStopPreview?: () => void;
};

/** The one special control in Settings: a tactile recommendation switch with an audible sample. */
export function RecommendedListeningSwitch({ enabled, clearMode = false, classification, integrated = false, reduceEffects = false, onValueChange, onOpenInspector, onPreview, onStopPreview }: Props) {
  const slide = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (reduceEffects) {
      slide.setValue(enabled ? 1 : 0);
      return;
    }
    Animated.spring(slide, { toValue: enabled ? 1 : 0, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.7 }).start();
  }, [enabled, reduceEffects, slide]);

  useEffect(() => () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    onStopPreview?.();
  }, [onStopPreview]);

  useEffect(() => {
    if (enabled || !previewing) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    onStopPreview?.();
    setPreviewing(false);
  }, [enabled, onStopPreview, previewing]);

  const toggle = () => {
    Vibration.vibrate(8);
    onValueChange(!enabled);
  };

  const togglePreview = (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    if (previewing) {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = null;
      onStopPreview?.();
      setPreviewing(false);
      return;
    }
    onPreview?.(() => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = null;
      setPreviewing(false);
    });
    setPreviewing(true);
    previewTimer.current = setTimeout(() => {
      previewTimer.current = null;
      setPreviewing(false);
    }, 6500);
  };

  const classificationLabel = classification === 'shortForm' ? 'Short read' : classification.charAt(0).toUpperCase() + classification.slice(1);

  return <Pressable onPress={toggle} accessibilityRole="switch" accessibilityState={{ checked: enabled }} accessibilityLabel={`Golden Switch${clearMode ? ', Clear Mode' : ', Recommended'}`} accessibilityHint="Optimizes the installed voice, speech settings, and natural pacing" style={({ pressed }) => [styles.card, enabled && styles.cardEnabled, integrated && styles.cardIntegrated, pressed && styles.pressed]}>
    <View style={styles.header}>
      <View style={[styles.iconWell, enabled && styles.iconWellEnabled]}><Text style={[styles.icon, enabled && styles.iconEnabled]}>✦</Text></View>
      <View style={styles.copy}>
        <View style={styles.titleRow}><Text style={styles.title}>Golden Switch</Text><Text style={styles.badgeText}>RECOMMENDED</Text>{onOpenInspector && <Pressable onPress={(event) => { event.stopPropagation(); onOpenInspector(); }} hitSlop={8} style={styles.infoButton} accessibilityRole="button" accessibilityLabel="Open Golden Switch Settings" accessibilityHint="Shows the settings Golden Switch is currently using"><Text style={styles.infoText}>ⓘ</Text></Pressable>}</View>
        <Text style={styles.description}>{clearMode ? 'Clear Mode makes dense material easier to follow with a gentle, spacious pace.' : 'Automatically chooses a clear voice and comfortable pace, then adapts as you listen for clearer reading.'}</Text>
      </View>
    </View>
    <View style={styles.contextRow}><View style={[styles.contextDot, enabled && styles.contextDotEnabled]} /><Text style={styles.contextText}>For this text: {classificationLabel} · {clearMode ? 'extra clarity' : 'balanced clarity'}</Text></View>
    <View style={styles.actionRow}>
      {onPreview ? <Pressable onPress={togglePreview} style={({ pressed }) => [styles.previewButton, previewing && styles.previewButtonActive, pressed && styles.previewPressed]} accessibilityRole="button" accessibilityLabel={previewing ? 'Stop Golden Switch sample' : 'Hear a Golden Switch sample'} accessibilityHint="Previews the voice and pacing without changing your listening settings"><Text style={[styles.previewGlyph, previewing && styles.previewGlyphActive]}>{previewing ? 'Ⅱ' : '▶'}</Text><View style={styles.previewCopy}><Text style={[styles.previewTitle, previewing && styles.previewTitleActive]}>{previewing ? 'Playing sample' : 'Hear a sample'}</Text><Text style={styles.previewHint}>{previewing ? 'Tap to stop' : 'Try the current Golden sound'}</Text></View></Pressable> : <View style={styles.previewSpacer} />}
      <View style={styles.switchGroup}><Text style={styles.switchLabel}>{enabled ? (clearMode ? 'CLEAR MODE' : 'GOLDEN ON') : 'GOLDEN OFF'}</Text><View style={[styles.switchShell, enabled && styles.switchShellEnabled]} pointerEvents="none">
        <Text style={[styles.state, enabled && styles.stateEnabled]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{enabled ? 'ON' : 'OFF'}</Text>
        <View style={[styles.cavity, enabled && styles.cavityEnabled]}><Animated.View style={[styles.block, enabled && styles.blockEnabled, { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 31] }) }] }]} /></View>
      </View></View>
    </View>
    <Text style={[styles.resolved, enabled && styles.resolvedEnabled]}>{enabled ? `${clearMode ? 'Active · Clear Mode' : 'Active'} · Soundoc will use this automatically` : 'Off · tap anywhere on this card to turn it on'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { minHeight: 204, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', borderBottomColor: 'rgba(0,0,0,0.72)', ...shadows.raised },
  cardEnabled: { borderColor: colors.recommendedGoldDark, borderTopColor: colors.recommendedGoldDark, borderBottomColor: colors.recommendedGoldDark, shadowColor: colors.recommendedGold, shadowOpacity: 0.18, shadowRadius: 15 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  iconWell: { width: 40, height: 40, borderRadius: radius.small, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  iconWellEnabled: { backgroundColor: 'rgba(216,180,90,0.14)', borderColor: colors.recommendedGoldDark },
  icon: { color: colors.textTertiary, fontSize: 19 },
  iconEnabled: { color: colors.recommendedGoldBright },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 1 },
  infoText: { color: colors.recommendedGoldBright, fontSize: 17, lineHeight: 20 },
  title: { ...type.heading, color: colors.textPrimary },
  badgeText: { ...type.caption, color: colors.recommendedGoldBright, fontSize: 9, lineHeight: 15, letterSpacing: 0.7, fontWeight: '700' },
  description: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 4 },
  contextRow: { minHeight: 30, marginTop: space.sm, paddingHorizontal: space.sm, borderRadius: radius.small, backgroundColor: colors.surfaceInset, flexDirection: 'row', alignItems: 'center', gap: 7 },
  contextDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textTertiary },
  contextDotEnabled: { backgroundColor: colors.recommendedGoldBright },
  contextText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  previewButton: { flex: 1, minHeight: 60, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.64)', flexDirection: 'row', alignItems: 'center', gap: space.xs },
  previewButtonActive: { backgroundColor: 'rgba(216,180,90,0.14)', borderColor: colors.recommendedGoldDark },
  previewPressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },
  previewGlyph: { width: 30, color: colors.recommendedGoldBright, fontSize: 17, textAlign: 'center' },
  previewGlyphActive: { color: colors.textPrimary },
  previewCopy: { flex: 1, minWidth: 0 },
  previewTitle: { ...type.label, color: colors.textPrimary },
  previewTitleActive: { color: colors.recommendedGoldBright },
  previewHint: { ...type.caption, color: colors.textTertiary, marginTop: 2, lineHeight: 15 },
  previewSpacer: { flex: 1 },
  switchGroup: { alignItems: 'flex-end', gap: 4 },
  switchLabel: { ...type.caption, color: colors.textTertiary, fontSize: 9, letterSpacing: 0.8 },
  switchShell: { minHeight: 58, minWidth: 104, paddingHorizontal: 7, paddingVertical: 8, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', borderBottomColor: 'rgba(0,0,0,0.78)', flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 5 }, shadowRadius: 8, elevation: 4 },
  switchShellEnabled: { borderColor: colors.recommendedGoldDark },
  state: { ...type.caption, color: colors.textTertiary, width: 29, minWidth: 29, fontSize: 11, lineHeight: 14, textAlign: 'center', letterSpacing: 0.3, flexShrink: 0 },
  stateEnabled: { color: colors.recommendedGold },
  cavity: { width: 68, height: 38, padding: 4, overflow: 'hidden', borderRadius: 13, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.75)', borderBottomColor: 'rgba(255,255,255,0.06)', shadowColor: '#000', shadowOpacity: 0.48, shadowOffset: { width: 0, height: 4 }, shadowRadius: 6, elevation: 3 },
  cavityEnabled: { borderColor: colors.recommendedGoldDark },
  block: { width: 29, height: 28, borderRadius: 9, backgroundColor: colors.surfacePressed, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.7)' },
  blockEnabled: { backgroundColor: colors.recommendedGold, borderTopColor: colors.recommendedGoldBright, borderBottomColor: colors.recommendedGoldDark, shadowColor: colors.recommendedGold, shadowOpacity: 0.85, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 9 },
  resolved: { ...type.caption, color: colors.textTertiary, marginTop: space.sm, lineHeight: 16 },
  resolvedEnabled: { color: colors.recommendedGold },
  pressed: { transform: [{ scale: 0.985 }] },
  cardIntegrated: { marginTop: 0, borderWidth: 0, borderRadius: 0, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
});
