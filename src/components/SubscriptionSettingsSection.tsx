import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
    <Text style={styles.sectionTitle}>Plan</Text>
    <View style={[styles.card, subscription.isFree && styles.freeCard]}>
      <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.summary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${status}. ${detail}. View Soundoc Pro plans.`}>
        <View style={[styles.icon, subscription.isPro && styles.iconActive, subscription.isFree && styles.iconFree]}>{subscription.isFree ? <Image source={require('../../assets/icon.png')} style={styles.freeLogo} resizeMode="cover" accessibilityLabel="Soundoc logo" /> : <Text style={styles.iconText}>✦</Text>}</View><View style={styles.copy}><Text style={styles.label}>{status}</Text><Text style={styles.detail}>{detail}</Text></View><Text style={styles.chevron}>›</Text>
      </Pressable>
      <View style={styles.actions}>
        <Pressable onPress={() => void subscription.restorePurchases()} disabled={subscription.isPurchasing} style={({ pressed }) => [styles.action, styles.actionRaised, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ disabled: subscription.isPurchasing }} accessibilityLabel="Restore purchases"><Text style={styles.actionText}>Restore Purchases</Text></Pressable>
        {subscription.isPro && <Pressable onPress={() => void subscription.openSubscriptionManagement()} style={({ pressed }) => [styles.action, styles.actionRaised, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Manage Soundoc Pro subscription"><Text style={styles.actionText}>Manage Subscription</Text></Pressable>}
        <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.action, styles.actionRaised, subscription.isFree && styles.actionPrimary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="View Soundoc Pro plans"><Text style={[styles.actionText, subscription.isFree && styles.actionPrimaryText]}>{subscription.isFree ? 'Go Unlimited' : subscription.isPro ? 'View Plans' : 'View Pro'}</Text></Pressable>
      </View>
      {subscription.isFree && <View pointerEvents="none" style={styles.freeCardOutline} />}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: space.xxl },
  sectionTitle: { ...type.caption, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: space.sm },
  card: { overflow: 'hidden', borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', borderBottomColor: 'rgba(0,0,0,0.70)' },
  freeCard: { overflow: 'visible', backgroundColor: colors.accentSoft, borderColor: 'rgba(255,113,56,0.32)', borderTopColor: 'rgba(255,183,137,0.38)', borderBottomColor: 'rgba(255,113,56,0.32)', shadowColor: colors.accentPrimary, shadowOpacity: 0.16, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 5 },
  freeCardOutline: { ...StyleSheet.absoluteFill, borderWidth: 1, borderRadius: radius.large, borderColor: 'rgba(255,113,56,0.38)', borderTopColor: 'rgba(255,183,137,0.44)', borderBottomColor: 'rgba(255,113,56,0.38)', zIndex: 10 },
  summary: { minHeight: 82, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 40, height: 40, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  iconActive: { backgroundColor: colors.successSoft },
  iconFree: { backgroundColor: colors.surfaceInset, borderWidth: 1.5, borderColor: 'rgba(244,215,124,0.82)', shadowColor: colors.recommendedGold, shadowOpacity: 0.20, shadowOffset: { width: 0, height: 1 }, shadowRadius: 5, elevation: 2, overflow: 'hidden' },
  freeLogo: { width: 34, height: 34, borderRadius: 11 },
  iconText: { color: colors.accentPrimary, fontSize: 17 },
  copy: { flex: 1, minWidth: 0 },
  label: { ...type.heading, color: colors.textPrimary },
  detail: { ...type.caption, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  chevron: { color: colors.accentPrimary, fontSize: 26, lineHeight: 28 },
  actions: { flexDirection: 'row', gap: 1, padding: 1, backgroundColor: 'transparent', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  action: { flex: 1, minHeight: 44, paddingHorizontal: space.xs, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  actionRaised: { backgroundColor: '#1A1F23', borderWidth: 1, borderColor: 'rgba(255,255,255,0.055)', borderTopColor: 'rgba(255,255,255,0.09)', borderBottomColor: 'rgba(0,0,0,0.62)', shadowColor: '#000000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2 },
  actionPrimary: { backgroundColor: '#E86032', borderColor: '#D9552C', shadowColor: '#E86032', shadowOpacity: 0.14 },
  actionText: { ...type.caption, color: colors.accentPrimary, textAlign: 'center', fontWeight: '700' },
  actionPrimaryText: { color: '#FFFFFF' },
  pressed: { opacity: 0.82 },
});
