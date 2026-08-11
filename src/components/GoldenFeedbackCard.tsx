import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from '../lib/theme';
import type { GoldenFeedbackReason } from '../lib/goldenPersonalization';

type Props = { visible: boolean; attached?: boolean; onGood: () => void; onNotQuite: () => void; onReason: (reason: GoldenFeedbackReason) => void; onDismiss: () => void };

export function GoldenFeedbackCard({ visible, attached = false, onGood, onNotQuite, onReason, onDismiss }: Props) {
  const [showReasons, setShowReasons] = useState(false);
  if (!visible) return null;
  const notQuite = () => { onNotQuite(); setShowReasons(true); };
  return <View style={[styles.card, attached && styles.attachedCard]}>
    <View style={styles.header}><View style={styles.icon}><Text style={styles.iconText}>✦</Text></View><View style={styles.copy}><Text style={styles.title}>How does Golden sound?</Text><Text style={styles.detail}>Your feedback helps Golden fine-tune your listening.</Text></View><Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss Golden feedback"><Text style={styles.dismiss}>×</Text></Pressable></View>
    {!showReasons ? <View style={styles.actions}><Pressable onPress={onGood} style={[styles.action, styles.good]} accessibilityRole="button"><Text style={styles.actionText}>👍 Good</Text></Pressable><Pressable onPress={notQuite} style={[styles.action, styles.notQuite]} accessibilityRole="button"><Text style={styles.actionText}>👎 Not Quite</Text></Pressable></View> : <View style={styles.reasonBlock}><Text style={styles.reasonTitle}>What felt off? <Text style={styles.optional}>(optional)</Text></Text><View style={styles.reasonGrid}><ReasonButton label="Too Fast" onPress={() => onReason('tooFast')} /><ReasonButton label="Too Slow" onPress={() => onReason('tooSlow')} /><ReasonButton label="Voice" onPress={() => onReason('voice')} /><ReasonButton label="Pauses" onPress={() => onReason('pauses')} /><ReasonButton label="Something Else" onPress={() => onReason('somethingElse')} /><ReasonButton label="Skip" onPress={onDismiss} /></View></View>}
  </View>;
}

function ReasonButton({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.reason, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.reasonText}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  card: { marginTop: space.sm, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.recommendedGoldDark },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 32, height: 32, borderRadius: radius.small, backgroundColor: 'rgba(216,180,90,0.14)', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.recommendedGoldBright, fontSize: 16 },
  copy: { flex: 1 },
  title: { ...type.heading, color: colors.textPrimary },
  detail: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  dismiss: { color: colors.textTertiary, fontSize: 24, lineHeight: 24, padding: 2 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  action: { flex: 1, minHeight: 44, borderRadius: radius.small, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  good: { backgroundColor: colors.successSoft, borderColor: colors.success },
  notQuite: { backgroundColor: colors.surfaceInset, borderColor: colors.borderSubtle },
  actionText: { ...type.label, color: colors.textPrimary },
  reasonBlock: { marginTop: space.md },
  reasonTitle: { ...type.label, color: colors.textPrimary },
  optional: { ...type.caption, color: colors.textTertiary },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  reason: { minHeight: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center', justifyContent: 'center' },
  reasonText: { ...type.caption, color: colors.textSecondary },
  pressed: { opacity: 0.78 },
  attachedCard: { marginTop: -1, paddingTop: space.sm, borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
});
