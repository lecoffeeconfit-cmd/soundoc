import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, space, type } from '../lib/theme';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  compact?: boolean;
  accentColor?: string;
  onTrackColor?: string;
};

export function SoundocToggle({ value, onValueChange, label, disabled = false, onLabel = 'ON', offLabel = 'OFF', accessibilityLabel, accessibilityHint, testID, compact = false, accentColor = colors.accentPrimary, onTrackColor = '#3A241C' }: Props) {
  const motion = useRef(new Animated.Value(value ? 1 : 0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReduceMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion) { motion.setValue(value ? 1 : 0); return; }
    Animated.spring(motion, { toValue: value ? 1 : 0, useNativeDriver: false, damping: 20, stiffness: 240, mass: 0.75 }).start();
  }, [motion, reduceMotion, value]);

  const trackColor = motion.interpolate({ inputRange: [0, 1], outputRange: [colors.backgroundSecondary, onTrackColor] });
  const labelColor = motion.interpolate({ inputRange: [0, 1], outputRange: [colors.textTertiary, accentColor] });
  const knobColor = motion.interpolate({ inputRange: [0, 1], outputRange: [colors.surfacePressed, accentColor] });
  const knobOnStyle = { borderTopColor: accentColor === colors.success ? '#A4F0BB' : '#FFB083', borderBottomColor: accentColor === colors.success ? '#27884C' : '#A93D20', shadowColor: accentColor };

  return <View style={[styles.wrap, compact && styles.wrapCompact]}>
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel ?? label ?? 'Soundoc toggle'}
      accessibilityHint={accessibilityHint ?? `Double tap to turn ${value ? 'off' : 'on'}`}
      style={({ pressed }) => [styles.shell, compact && styles.shellCompact, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Animated.Text style={[styles.state, compact && styles.stateCompact, { color: labelColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{value ? onLabel : offLabel}</Animated.Text>
      <Animated.View style={[styles.cavity, compact && styles.cavityCompact, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.knob, compact && styles.knobCompact, { backgroundColor: knobColor, transform: [{ translateX: motion.interpolate({ inputRange: [0, 1], outputRange: [0, compact ? 25 : 31] }) }] }, value && [styles.knobOn, knobOnStyle]]} />
      </Animated.View>
    </Pressable>
    {label && <Text style={[styles.externalLabel, disabled && styles.externalLabelDisabled]}>{label}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 64 },
  wrapCompact: { minHeight: 52 },
  shell: { minHeight: 64, minWidth: 154, paddingHorizontal: 11, paddingVertical: 9, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.13)', borderBottomColor: 'rgba(0,0,0,0.76)', flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 0, ...shadows.raised },
  shellCompact: { minHeight: 54, minWidth: 140, paddingVertical: 7 },
  state: { ...type.caption, width: 34, minWidth: 34, color: colors.textTertiary, fontSize: 11, lineHeight: 14, textAlign: 'center', letterSpacing: 0.9, flexShrink: 0 },
  stateCompact: { width: 30, minWidth: 30, fontSize: 10, lineHeight: 13 },
  cavity: { width: 72, height: 42, padding: 5, overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.78)', borderBottomColor: 'rgba(255,255,255,0.07)', shadowColor: '#000', shadowOpacity: 0.5, shadowOffset: { width: 0, height: 4 }, shadowRadius: 7, elevation: 3 },
  cavityCompact: { width: 64, height: 36, padding: 4, borderRadius: 12 },
  knob: { width: 31, height: 30, borderRadius: 10, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.11)', borderBottomColor: 'rgba(0,0,0,0.72)', shadowColor: '#000', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 3 }, shadowRadius: 5, elevation: 4 },
  knobCompact: { width: 27, height: 26, borderRadius: 9 },
  knobOn: { borderTopColor: '#FFB083', borderBottomColor: '#A93D20', shadowColor: colors.accentPrimary, shadowOpacity: 0.65, shadowRadius: 11, shadowOffset: { width: 0, height: 0 }, elevation: 7 },
  externalLabel: { ...type.label, color: colors.textPrimary, flex: 1 },
  externalLabelDisabled: { color: colors.textDisabled },
  disabled: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.985 }] },
});
