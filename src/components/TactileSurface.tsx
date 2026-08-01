import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { colors, radius, shadows } from '../lib/theme';

/** A consistent graphite surface for short, interactive groups—not long document text. */
export function TactileSurface({ children, style, inset = false }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; inset?: boolean }>) {
  return <View style={[styles.surface, inset && styles.inset, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: { backgroundColor: colors.surfacePrimary, borderRadius: radius.large, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.55)', ...shadows.raised },
  inset: { backgroundColor: colors.surfaceInset, shadowOpacity: 0.14, elevation: 2 },
});
