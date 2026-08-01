import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { colors, radius, shadows } from '../lib/theme';

export type GraphiteCardVariant = 'raised' | 'recessed' | 'flat';

/** Layered graphite surface: highlight, body, lower edge, and restrained depth. */
export function RaisedGraphiteCard({ children, variant = 'raised', style }: PropsWithChildren<{ variant?: GraphiteCardVariant; style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, styles[variant], style]}><View pointerEvents="none" style={styles.topHighlight} /><View pointerEvents="none" style={styles.bottomEdge} />{children}</View>;
}

const styles = StyleSheet.create({
  card: { position: 'relative', overflow: 'hidden', borderRadius: radius.large, borderWidth: 1 },
  raised: { backgroundColor: colors.surfacePrimary, borderTopColor: 'rgba(255,255,255,0.09)', borderBottomColor: 'rgba(0,0,0,0.62)', ...shadows.raised },
  recessed: { backgroundColor: colors.surfaceInset, borderTopColor: 'rgba(0,0,0,0.52)', borderBottomColor: 'rgba(255,255,255,0.035)', shadowColor: '#000', shadowOpacity: 0.22, shadowOffset: { width: 0, height: -3 }, shadowRadius: 8, elevation: 2 },
  flat: { backgroundColor: colors.surfacePrimary, borderColor: colors.borderSubtle },
  topHighlight: { position: 'absolute', top: 0, left: 12, right: 12, height: 1, backgroundColor: 'rgba(255,255,255,0.11)', zIndex: 1 },
  bottomEdge: { position: 'absolute', bottom: 0, left: 10, right: 10, height: 1, backgroundColor: 'rgba(0,0,0,0.42)', zIndex: 1 },
});
