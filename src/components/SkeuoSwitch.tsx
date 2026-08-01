import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { colors, radius, shadows, space, type } from '../lib/theme';

export function SkeuoSwitch({ value, onValueChange, label }: { value: boolean; onValueChange: (value: boolean) => void; label?: string }) {
  const slide = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => { Animated.spring(slide, { toValue: value ? 1 : 0, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.7 }).start(); }, [slide, value]);
  const toggle = () => { Vibration.vibrate(8); onValueChange(!value); };
  return <Pressable onPress={toggle} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label ?? 'Switch'} style={({ pressed }) => [styles.shell, pressed && styles.pressed]}><Text style={styles.state}>{value ? 'ON' : 'OFF'}</Text><View style={styles.cavity}><Animated.View style={[styles.block, { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 37] }) }] }, value && styles.blockOn]} /></View>{label && <Text style={styles.label}>{label}</Text>}</Pressable>;
}

const styles = StyleSheet.create({
  shell: { minHeight: 68, minWidth: 178, paddingHorizontal: space.sm, paddingVertical: 9, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', borderBottomColor: 'rgba(0,0,0,0.72)', flexDirection: 'row', alignItems: 'center', gap: space.sm, ...shadows.raised },
  state: { ...type.caption, color: colors.textSecondary, width: 26, textAlign: 'center', letterSpacing: 0.5 },
  cavity: { width: 78, height: 44, padding: 4, overflow: 'hidden', borderRadius: 13, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.72)', borderBottomColor: 'rgba(255,255,255,0.06)', shadowColor: '#000', shadowOpacity: 0.48, shadowOffset: { width: 0, height: 4 }, shadowRadius: 6, elevation: 3 },
  block: { width: 35, height: 34, borderRadius: 9, backgroundColor: colors.surfacePressed, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.70)' },
  blockOn: { backgroundColor: colors.accentRecording, borderColor: '#B82D20', shadowColor: colors.accentRecording, shadowOpacity: 0.92, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  label: { ...type.label, color: colors.textPrimary, flex: 1 }, pressed: { transform: [{ scale: 0.98 }] },
});
