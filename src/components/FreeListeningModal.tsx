import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatFreeListeningRemaining } from '../lib/freeListening';
import { formatDuration } from '../lib/text';
import { colors, radius, space, type } from '../lib/theme';

export type FreeListeningModalKind = 'low' | 'limit' | null;

export function FreeListeningModal({ kind, remainingSeconds, resetLabel, readyListeningSeconds, onUpgrade, onDismiss, onLibrary }: { kind: FreeListeningModalKind; remainingSeconds: number; resetLabel: string; readyListeningSeconds: number; onUpgrade: () => void; onDismiss: () => void; onLibrary: () => void }) {
  const limitReached = kind === 'limit';
  const ready = readyListeningSeconds > 0 ? `${formatDuration(readyListeningSeconds).replace('About ', '')} ready to listen` : null;
  return <Modal visible={kind !== null} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
    <View style={styles.backdrop}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.card, limitReached && styles.limitCard]}>
          <View style={[styles.icon, limitReached && styles.limitIcon]}><Text style={styles.iconText}>{limitReached ? '◷' : '⌁'}</Text></View>
          <Text style={styles.kicker}>{limitReached ? 'SOUNDOC FREE' : 'FREE LISTENING'}</Text>
          <Text style={styles.title}>{limitReached ? "You've used your free listening hour" : `${formatFreeListeningRemaining(remainingSeconds)} this week`}</Text>
          <Text style={styles.message}>{limitReached ? `Your documents, bookmarks, and listening progress are safe. ${resetLabel}.` : 'Your documents and progress will stay saved. Upgrade anytime for unlimited listening.'}</Text>
          {ready && <View style={styles.readyWell}><Text style={styles.readyKicker}>IN YOUR LIBRARY</Text><Text style={styles.readyText}>{ready}</Text></View>}
          <Pressable onPress={onUpgrade} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Continue listening unlimited"><Text style={styles.primaryText}>{limitReached ? 'Continue Listening Unlimited' : 'Go Unlimited'}</Text><Text style={styles.primaryArrow}>›</Text></Pressable>
          {limitReached ? <Pressable onPress={onLibrary} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Back to library"><Text style={styles.secondaryText}>Back to Library</Text></Pressable> : <Pressable onPress={onDismiss} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Keep listening"><Text style={styles.secondaryText}>Keep Listening</Text></Pressable>}
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(4,6,8,0.68)', padding: space.md },
  safe: { width: '100%', maxWidth: 620, alignSelf: 'center' },
  card: { padding: space.xl, borderRadius: radius.xlarge, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(216,180,90,0.38)', borderBottomColor: 'rgba(0,0,0,0.78)', shadowColor: '#000', shadowOpacity: 0.48, shadowOffset: { width: 0, height: 14 }, shadowRadius: 28, elevation: 12 },
  limitCard: { borderTopColor: 'rgba(255,113,56,0.42)' },
  icon: { width: 52, height: 52, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.16)' },
  limitIcon: { backgroundColor: colors.accentSoft },
  iconText: { color: colors.recommendedGoldBright, fontSize: 26, fontWeight: '700' },
  kicker: { ...type.caption, color: colors.recommendedGoldBright, letterSpacing: 1.1, marginTop: space.lg },
  title: { ...type.title, color: colors.textPrimary, fontSize: 24, lineHeight: 30, marginTop: 5 },
  message: { ...type.body, color: colors.textSecondary, lineHeight: 23, marginTop: space.sm },
  readyWell: { marginTop: space.lg, padding: space.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle },
  readyKicker: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.8, fontSize: 10 },
  readyText: { ...type.label, color: colors.textPrimary, marginTop: 3 },
  primary: { minHeight: 56, marginTop: space.xl, paddingHorizontal: space.lg, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: colors.accentPrimary, shadowOpacity: 0.24, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14, elevation: 5 },
  primaryText: { ...type.heading, color: '#FFFFFF', flex: 1 },
  primaryArrow: { color: '#FFFFFF', fontSize: 28 },
  secondary: { minHeight: 48, marginTop: space.sm, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.56)' },
  secondaryText: { ...type.label, color: colors.textPrimary },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
});
