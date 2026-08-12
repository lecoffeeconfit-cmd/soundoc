import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSubscription } from '../hooks/useSubscription';
import { formatFreeListeningRemaining } from '../lib/freeListening';
import { colors, radius, space, type } from '../lib/theme';
import { formatTrialEndDate, formatTrialRemaining } from '../lib/trialPresentation';

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SubscriptionSettingsSection() {
  const subscription = useSubscription();
  const expiration = formatDate(subscription.subscriptionExpirationDate);
  const plan = subscription.activeProductIdentifier === subscription.annualPackage?.product.identifier ? 'Annual' : subscription.activeProductIdentifier === subscription.monthlyPackage?.product.identifier ? 'Monthly' : null;
  const detail = !subscription.isInitialized ? 'Checking your subscription…'
    : subscription.isTrialing ? `${formatTrialRemaining(subscription.trialExpirationDate, subscription.trialDaysRemaining)}${formatTrialEndDate(subscription.trialExpirationDate) ? ` · Ends ${formatTrialEndDate(subscription.trialExpirationDate)}` : ''}`
    : subscription.isPro && subscription.isCancellationPending ? `Active until ${expiration ?? 'the end of this period'}`
    : subscription.isPro ? `${plan ? `${plan} · ` : ''}${subscription.willRenew && expiration ? `Renews ${expiration}` : 'Active'}`
    : subscription.isFree ? `${formatFreeListeningRemaining(subscription.freeListeningSecondsRemaining)} this week · ${subscription.freeResetLabel ?? 'Resets Monday'}`
      : 'Unlock all Soundoc Pro features';
  const status = subscription.isTrialing ? 'Premium Trial' : subscription.isPro ? 'Active' : subscription.isFree ? 'Soundoc Free' : 'Soundoc Pro';

  return <View style={styles.section}>
    <Text style={styles.sectionTitle}>Subscription</Text>
    <View style={styles.card}>
      <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.summary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${status}. ${detail}. View Soundoc Pro plans.`}>
        <View style={[styles.icon, subscription.isPro && styles.iconActive, subscription.isFree && styles.iconFree]}><Text style={styles.iconText}>{subscription.isFree ? '◷' : '✦'}</Text></View><View style={styles.copy}><Text style={styles.label}>{status}</Text><Text style={styles.detail}>{detail}</Text></View><Text style={styles.chevron}>›</Text>
      </Pressable>
      <View style={styles.actions}>
        <Pressable onPress={() => void subscription.restorePurchases()} disabled={subscription.isPurchasing} style={({ pressed }) => [styles.action, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ disabled: subscription.isPurchasing }} accessibilityLabel="Restore purchases"><Text style={styles.actionText}>Restore Purchases</Text></Pressable>
        {subscription.isPro && <Pressable onPress={() => void subscription.openSubscriptionManagement()} style={({ pressed }) => [styles.action, styles.actionBorder, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Manage Soundoc Pro subscription"><Text style={styles.actionText}>Manage Subscription</Text></Pressable>}
        <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.action, styles.actionBorder, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="View Soundoc Pro plans"><Text style={styles.actionText}>{subscription.isFree ? 'Go Unlimited' : subscription.isPro ? 'View Plans' : 'View Pro'}</Text></Pressable>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: space.xxl }, sectionTitle: { ...type.caption, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: space.sm }, card: { overflow: 'hidden', borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', borderBottomColor: 'rgba(0,0,0,0.70)' }, summary: { minHeight: 82, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }, icon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }, iconActive: { backgroundColor: colors.successSoft }, iconFree: { backgroundColor: 'rgba(216,180,90,0.14)' }, iconText: { color: colors.accentPrimary, fontSize: 17 }, copy: { flex: 1, minWidth: 0 }, label: { ...type.heading, color: colors.textPrimary }, detail: { ...type.caption, color: colors.textSecondary, marginTop: 3, lineHeight: 18 }, chevron: { color: colors.accentPrimary, fontSize: 26, lineHeight: 28 }, actions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }, action: { flex: 1, minHeight: 46, paddingHorizontal: space.xs, alignItems: 'center', justifyContent: 'center' }, actionBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.divider }, actionText: { ...type.caption, color: colors.accentPrimary, textAlign: 'center' }, pressed: { opacity: 0.78, backgroundColor: colors.surfacePressed },
});
