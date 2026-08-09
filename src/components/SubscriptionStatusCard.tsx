import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isConfirmedFreeTrial } from '../context/SubscriptionContext';
import { useSubscription } from '../hooks/useSubscription';
import { colors, radius, space, type } from '../lib/theme';

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function periodLabel(period: string | null) {
  return period === 'P1Y' ? 'year' : period === 'P1M' ? 'month' : 'billing period';
}

export function SubscriptionStatusCard() {
  const subscription = useSubscription();
  const eligiblePackage = isConfirmedFreeTrial(subscription.annualPackage, subscription.trialEligibility)
    ? subscription.annualPackage
    : isConfirmedFreeTrial(subscription.monthlyPackage, subscription.trialEligibility)
      ? subscription.monthlyPackage
      : null;

  if (!subscription.isInitialized) {
    return <View style={styles.loadingCard} accessibilityRole="progressbar" accessibilityLabel="Checking Soundoc Pro status"><Text style={styles.loadingText}>Checking Soundoc Pro…</Text></View>;
  }

  if (subscription.isTrialing) {
    const days = subscription.trialDaysRemaining ?? 0;
    const daysLabel = days <= 0 ? 'Trial ends today' : days === 1 ? 'Trial ends tomorrow' : `${days} days left`;
    const activePackage = [subscription.monthlyPackage, subscription.annualPackage].find((item) => item?.product.identifier === subscription.activeProductIdentifier) ?? null;
    const priceLine = activePackage ? `Then ${activePackage.product.priceString}/${periodLabel(activePackage.product.subscriptionPeriod)} unless canceled` : 'Then your selected plan unless canceled';
    return <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.card, styles.trialCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Soundoc Pro Trial, ${daysLabel}`} accessibilityHint="Opens subscription details">
      <View style={styles.header}><View><Text style={styles.kicker}>SOUNDOC PRO TRIAL</Text><Text style={styles.title}>{daysLabel}</Text></View><Text style={styles.arrow}>›</Text></View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(4, Math.min(100, (days / 7) * 100))}%` }]} /></View>
      <Text style={styles.detail}>{priceLine}</Text>
    </Pressable>;
  }

  if (subscription.isPro) {
    const expiration = formatDate(subscription.subscriptionExpirationDate);
    const state = subscription.isCancellationPending && expiration ? `Active until ${expiration}` : subscription.willRenew && expiration ? `Renews ${expiration}` : 'Active';
    return <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.card, styles.activeCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Soundoc Pro, ${state}`} accessibilityHint="Opens subscription details">
      <View style={styles.header}><View><Text style={styles.kicker}>SOUNDOC PRO</Text><Text style={styles.title}>Active</Text></View><Text style={styles.arrow}>›</Text></View><Text style={styles.detail}>{state}</Text>
    </Pressable>;
  }

  return <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.card, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Explore Soundoc Pro" accessibilityHint="Opens Soundoc Pro plans">
    <View style={styles.header}><View><Text style={styles.kicker}>SOUNDOC PRO</Text><Text style={styles.title}>{eligiblePackage ? '7-day free trial' : 'Listen without limits'}</Text></View><View style={styles.ctaWell}><Text style={styles.ctaText}>{eligiblePackage ? 'Try Pro' : 'View Pro'}</Text></View></View>
    <Text style={styles.detail}>{eligiblePackage ? 'Unlock the full listening experience.' : 'Explore Soundoc Pro plans and benefits.'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  loadingCard: { minHeight: 72, marginTop: space.lg, padding: space.md, justifyContent: 'center', borderRadius: radius.large, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle },
  loadingText: { ...type.label, color: colors.textSecondary },
  card: { marginTop: space.lg, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.68)', shadowColor: '#000', shadowOpacity: 0.24, shadowOffset: { width: 0, height: 7 }, shadowRadius: 13, elevation: 5 },
  trialCard: { backgroundColor: '#221C19', borderColor: 'rgba(255,113,56,0.34)' },
  activeCard: { backgroundColor: colors.surfaceElevated },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  kicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1, fontSize: 10 },
  title: { ...type.heading, color: colors.textPrimary, marginTop: 3 },
  arrow: { color: colors.accentPrimary, fontSize: 27, lineHeight: 30 },
  ctaWell: { minHeight: 34, paddingHorizontal: space.sm, justifyContent: 'center', borderRadius: radius.small, backgroundColor: colors.accentPrimary },
  ctaText: { ...type.caption, color: '#FFFFFF', fontWeight: '700' },
  detail: { ...type.caption, color: colors.textSecondary, marginTop: space.sm, lineHeight: 18 },
  progressTrack: { height: 6, marginTop: space.md, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: colors.remainingProgress },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accentPrimary },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
});
