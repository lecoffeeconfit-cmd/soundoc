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
    {attached && <View style={styles.dropdownCaret} />}
    <View style={[styles.header, attached && styles.attachedHeader]}><View style={[styles.icon, attached && styles.attachedIcon]}><Text style={styles.iconText}>✦</Text></View><View style={styles.copy}><Text style={[styles.title, attached && styles.attachedTitle]}>How does Golden Switch sound?</Text><Text style={[styles.detail, attached && styles.attachedDetail]}>Your feedback helps Golden Switch fine-tune your listening.</Text></View><Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss Golden Switch feedback"><Text style={styles.dismiss}>×</Text></Pressable></View>
    {!showReasons ? <View style={[styles.actions, attached && styles.attachedActions]}><Pressable onPress={onGood} style={[styles.action, styles.good, attached && styles.attachedAction]} accessibilityRole="button"><Text style={[styles.actionText, attached && styles.attachedActionText]}>👍 Good</Text></Pressable><Pressable onPress={notQuite} style={[styles.action, styles.notQuite, attached && styles.attachedAction]} accessibilityRole="button"><Text style={[styles.actionText, attached && styles.attachedActionText]}>👎 Not Quite</Text></Pressable></View> : <View style={styles.reasonBlock}><Text style={styles.reasonTitle}>What felt off? <Text style={styles.optional}>(optional)</Text></Text><View style={styles.reasonGrid}><ReasonButton label="Too Fast" onPress={() => onReason('tooFast')} /><ReasonButton label="Too Slow" onPress={() => onReason('tooSlow')} /><ReasonButton label="Voice" onPress={() => onReason('voice')} /><ReasonButton label="Pauses" onPress={() => onReason('pauses')} /><ReasonButton label="Something Else" onPress={() => onReason('somethingElse')} /><ReasonButton label="Skip" onPress={onDismiss} /></View></View>}
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
  attachedCard: { marginTop: -space.md, marginHorizontal: space.md, paddingTop: space.xxl, paddingHorizontal: space.sm, paddingBottom: space.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderColor: colors.borderSubtle, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.6)', shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5, elevation: 1, zIndex: 0 },
  dropdownCaret: { position: 'absolute', top: -5, right: space.xxl, width: 10, height: 10, backgroundColor: colors.surfaceInset, borderLeftWidth: 1, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)', transform: [{ rotate: '45deg' }] },
  attachedHeader: { gap: space.xs },
  attachedIcon: { width: 28, height: 28, borderRadius: 9 },
  attachedTitle: { fontSize: 14, lineHeight: 18 },
  attachedDetail: { fontSize: 11, lineHeight: 15, marginTop: 1 },
  attachedActions: { marginTop: space.sm, gap: space.xs },
  attachedAction: { minHeight: 38, borderRadius: radius.small },
  attachedActionText: { fontSize: 13 },
});
