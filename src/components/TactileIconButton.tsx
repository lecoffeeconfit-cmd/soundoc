import type { ReactNode } from 'react';
import type { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, type } from '../lib/theme';

export function TactileIconButton({ icon, label, onPress, selected = false, size = 48, style }: { icon: ReactNode; label: string; onPress: (event: GestureResponderEvent) => void; selected?: boolean; size?: number; style?: StyleProp<ViewStyle> }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.button, { width: size, height: size }, selected && styles.selected, pressed && styles.pressed, style]}><View pointerEvents="none" style={styles.inner}><Text style={[styles.icon, selected && styles.selectedIcon]}>{icon}</Text></View></Pressable>;
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', borderBottomColor: 'rgba(0,0,0,0.62)', ...shadows.raised },
  inner: { width: '80%', height: '80%', alignItems: 'center', justifyContent: 'center', borderRadius: radius.small, borderWidth: 1, borderColor: 'rgba(0,0,0,0.16)' },
  icon: { ...type.heading, color: colors.textSecondary }, selected: { backgroundColor: colors.surfacePressed, borderTopColor: 'rgba(255,255,255,0.15)' }, selectedIcon: { color: colors.accentPrimary }, pressed: { transform: [{ scale: 0.94 }], shadowOpacity: 0.16, elevation: 3 },
});
