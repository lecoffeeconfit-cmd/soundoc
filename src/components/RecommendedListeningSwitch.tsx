import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { colors, radius, shadows, space, type } from '../lib/theme';

type Props = {
  enabled: boolean;
  classification: string;
  reduceEffects?: boolean;
  onValueChange: (value: boolean) => void;
  onOpenInspector?: () => void;
};

/** The one special control in Settings: a compact, gold, tactile recommendation switch. */
export function RecommendedListeningSwitch({ enabled, classification, reduceEffects = false, onValueChange, onOpenInspector }: Props) {
  const slide = useRef(new Animated.Value(enabled ? 1 : 0)).current;

  useEffect(() => {
    if (reduceEffects) {
      slide.setValue(enabled ? 1 : 0);
      return;
    }
    Animated.spring(slide, { toValue: enabled ? 1 : 0, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.7 }).start();
  }, [enabled, reduceEffects, slide]);

  const toggle = () => {
    Vibration.vibrate(8);
    onValueChange(!enabled);
  };

  return <Pressable onPress={toggle} accessibilityRole="switch" accessibilityState={{ checked: enabled }} accessibilityLabel="Golden Switch, Recommended" accessibilityHint="Optimizes the installed voice, speech settings, and natural pacing" style={({ pressed }) => [styles.card, enabled && styles.cardEnabled, pressed && styles.pressed]}>
    <View style={[styles.iconWell, enabled && styles.iconWellEnabled]}><Text style={[styles.icon, enabled && styles.iconEnabled]}>✦</Text></View>
    <View style={styles.copy}>
      <View style={styles.titleRow}><Text style={styles.title}>Golden Switch</Text>{onOpenInspector && <Pressable onPress={(event) => { event.stopPropagation(); onOpenInspector(); }} hitSlop={8} style={styles.infoButton} accessibilityRole="button" accessibilityLabel="Open Golden Switch Settings" accessibilityHint="Shows the settings Golden Switch is currently using"><Text style={styles.infoText}>ⓘ</Text></Pressable>}</View>
      <Text style={styles.description}>Optimized for clear, natural, podcast-style listening</Text>
      <Text style={[styles.resolved, enabled && styles.resolvedEnabled]}>{enabled ? 'Active · controls voice, tone, volume, and pacing' : 'Off · manual settings are available'}</Text>
    </View>
    <View style={[styles.switchShell, enabled && styles.switchShellEnabled]} pointerEvents="none">
      <Text style={[styles.state, enabled && styles.stateEnabled]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{enabled ? 'ON' : 'OFF'}</Text>
      <View style={[styles.cavity, enabled && styles.cavityEnabled]}><Animated.View style={[styles.block, enabled && styles.blockEnabled, { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 31] }) }] }]} /></View>
    </View>
    <View style={styles.badge}><Text style={styles.badgeText}>RECOMMENDED</Text></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { minHeight: 144, marginTop: space.lg, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', borderBottomColor: 'rgba(0,0,0,0.72)', flexDirection: 'row', alignItems: 'center', gap: space.sm, ...shadows.raised },
  cardEnabled: { borderColor: colors.recommendedGoldDark, borderTopColor: colors.recommendedGoldDark, borderBottomColor: colors.recommendedGoldDark, shadowColor: colors.recommendedGold, shadowOpacity: 0.18, shadowRadius: 15 },
  iconWell: { width: 40, height: 40, borderRadius: radius.small, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  iconWellEnabled: { backgroundColor: 'rgba(216,180,90,0.14)', borderColor: colors.recommendedGoldDark },
  icon: { color: colors.textTertiary, fontSize: 19 },
  iconEnabled: { color: colors.recommendedGoldBright },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 1 },
  infoText: { color: colors.recommendedGoldBright, fontSize: 17, lineHeight: 20 },
  title: { ...type.heading, color: colors.textPrimary },
  badge: { position: 'absolute', top: space.sm, right: space.sm, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(216,180,90,0.14)', borderWidth: 1, borderColor: colors.recommendedGoldDark, zIndex: 1 },
  badgeText: { ...type.caption, color: colors.recommendedGoldBright, fontSize: 9, lineHeight: 12, letterSpacing: 0.7 },
  description: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 4 },
  resolved: { ...type.caption, color: colors.textTertiary, marginTop: 5 },
  resolvedEnabled: { color: colors.recommendedGold },
  switchShell: { minHeight: 58, minWidth: 104, marginTop: space.sm, paddingHorizontal: 7, paddingVertical: 8, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', borderBottomColor: 'rgba(0,0,0,0.78)', flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 5 }, shadowRadius: 8, elevation: 4 },
  switchShellEnabled: { borderColor: colors.recommendedGoldDark },
  state: { ...type.caption, color: colors.textTertiary, width: 29, minWidth: 29, fontSize: 11, lineHeight: 14, textAlign: 'center', letterSpacing: 0.3, flexShrink: 0 },
  stateEnabled: { color: colors.recommendedGold },
  cavity: { width: 68, height: 38, padding: 4, overflow: 'hidden', borderRadius: 13, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.75)', borderBottomColor: 'rgba(255,255,255,0.06)', shadowColor: '#000', shadowOpacity: 0.48, shadowOffset: { width: 0, height: 4 }, shadowRadius: 6, elevation: 3 },
  cavityEnabled: { borderColor: colors.recommendedGoldDark },
  block: { width: 29, height: 28, borderRadius: 9, backgroundColor: colors.surfacePressed, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.7)' },
  blockEnabled: { backgroundColor: colors.recommendedGold, borderTopColor: colors.recommendedGoldBright, borderBottomColor: colors.recommendedGoldDark, shadowColor: colors.recommendedGold, shadowOpacity: 0.85, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 9 },
  pressed: { transform: [{ scale: 0.985 }] },
});
