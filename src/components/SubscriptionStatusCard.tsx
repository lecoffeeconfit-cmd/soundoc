import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isConfirmedFreeTrial } from '../context/SubscriptionContext';
import { useSubscription } from '../hooks/useSubscription';
import { FREE_CRITICAL_ALLOWANCE_SECONDS, formatFreeListeningRemaining } from '../lib/freeListening';
import { formatDuration } from '../lib/text';
import { colors, radius, space, type } from '../lib/theme';
import { formatTrialEndDate, formatTrialRemaining, trialRemainingProgress } from '../lib/trialPresentation';

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SubscriptionStatusCard({ readyListeningSeconds = 0 }: { readyListeningSeconds?: number }) {
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
    const remainingLabel = formatTrialRemaining(subscription.trialExpirationDate, days);
    const remainingProgress = trialRemainingProgress(subscription.trialStartDate, subscription.trialExpirationDate);
    const endDate = formatTrialEndDate(subscription.trialExpirationDate);
    const nearEnd = Boolean(subscription.trialExpirationDate && new Date(subscription.trialExpirationDate).getTime() - Date.now() <= 24 * 60 * 60 * 1000);
    const secondary = `Full Premium access${endDate ? ` · Ends ${endDate}` : ''}`;
    return <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.card, styles.trialCard, nearEnd && styles.trialCardNearEnd, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Premium Trial. ${remainingLabel}. ${secondary}. Keep Premium.`} accessibilityValue={{ text: `${remainingLabel}. ${secondary}` }} accessibilityHint="Opens the existing Soundoc Pro subscription options">
      <View style={styles.header}><View style={styles.freeTitleWrap}><Text style={styles.kicker}>PREMIUM TRIAL</Text><Text style={styles.freeTitle}>{remainingLabel}</Text></View><View style={[styles.ctaWell, styles.trialCtaWell]}><Text style={styles.ctaText} numberOfLines={1}>Keep Premium</Text></View></View>
      <View style={styles.progressTrack} accessibilityElementsHidden>{remainingProgress !== undefined ? <View style={[styles.progressFill, styles.trialProgressFill, { width: `${remainingProgress * 100}%` }]} /> : null}</View>
      <View style={styles.freeFooter}><Text style={[styles.detail, styles.freeFooterReset]}>Full Premium access</Text><Text style={styles.freeFooterDot}>·</Text><Text style={styles.ready} numberOfLines={1}>{endDate ? `Ends ${endDate}` : 'Trial active'}</Text></View>
    </Pressable>;
  }

  if (subscription.isPro) {
    const expiration = formatDate(subscription.subscriptionExpirationDate);
    const state = subscription.isCancellationPending && expiration ? `Active until ${expiration}` : subscription.willRenew && expiration ? `Renews ${expiration}` : 'Active';
    return <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.card, styles.activeCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Soundoc Pro, ${state}`} accessibilityHint="Opens subscription details">
      <View style={styles.header}><View><Text style={styles.kicker}>SOUNDOC PRO</Text><Text style={styles.title}>Active</Text></View><Text style={styles.arrow}>›</Text></View><Text style={styles.detail}>{state}</Text>
    </Pressable>;
  }

  if (subscription.isFree) {
    const remaining = subscription.freeListeningSecondsRemaining;
    const critical = remaining <= FREE_CRITICAL_ALLOWANCE_SECONDS;
    const remainingLabel = formatFreeListeningRemaining(remaining).replace(' left', ' remaining');
    const ready = readyListeningSeconds > 0 ? `${formatDuration(readyListeningSeconds).replace('About ', '')} ready in Library` : 'Library ready when you are';
    const resetLabel = subscription.freeResetLabel ?? 'Weekly reset';
    return <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.card, styles.freeCard, critical && styles.freeCardCritical, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Soundoc Free. ${remainingLabel}. ${resetLabel}. Go Unlimited.`} accessibilityValue={{ text: `${remainingLabel}. ${resetLabel}. ${ready}` }} accessibilityHint="Opens unlimited listening plans">
      <View style={styles.header}><View style={styles.freeTitleWrap}><Text style={styles.kicker}>SOUNDOC FREE</Text><Text style={styles.freeTitle}>{remainingLabel}</Text></View><View style={styles.ctaWell}><Text style={styles.ctaText} numberOfLines={1}>Go Unlimited</Text></View></View>
      <View style={styles.progressTrack} accessibilityElementsHidden><View style={[styles.progressFill, critical && styles.progressFillCritical, { width: `${Math.max(0, Math.min(100, (1 - subscription.freeUsagePercent) * 100))}%` }]} /></View>
      <View style={styles.freeFooter}><Text style={[styles.detail, styles.freeFooterReset]}>{resetLabel}</Text><Text style={styles.freeFooterDot}>·</Text><Text style={styles.ready} numberOfLines={1}>{ready}</Text></View>
    </Pressable>;
  }

  return <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.card, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Explore Soundoc Pro" accessibilityHint="Opens Soundoc Pro plans">
    <View style={styles.header}><View><Text style={styles.kicker}>SOUNDOC PRO</Text><Text style={styles.title}>{eligiblePackage ? '7-day free trial' : 'Listen without limits'}</Text></View><View style={styles.ctaWell}><Text style={styles.ctaText}>{eligiblePackage ? 'Try Pro' : 'View Pro'}</Text></View></View>
    <Text style={styles.detail}>{eligiblePackage ? 'Unlock the full listening experience.' : 'Explore Soundoc Pro plans and benefits.'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  loadingCard: { width: '100%', maxWidth: 620, alignSelf: 'center', minHeight: 72, marginTop: space.lg, padding: space.md, justifyContent: 'center', borderRadius: radius.large, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle },
  loadingText: { ...type.label, color: colors.textSecondary },
  card: { width: '100%', maxWidth: 620, alignSelf: 'center', marginTop: space.lg, padding: space.md, borderRadius: radius.large, backgroundColor: '#1B1F20', borderWidth: 1, borderColor: 'rgba(216,180,90,0.30)', borderTopColor: 'rgba(244,215,124,0.38)', borderBottomColor: 'rgba(0,0,0,0.68)', shadowColor: '#000', shadowOpacity: 0.26, shadowOffset: { width: 0, height: 7 }, shadowRadius: 14, elevation: 5 },
  trialCard: { paddingVertical: space.sm },
  trialCardNearEnd: { borderColor: 'rgba(216,180,90,0.42)', borderTopColor: 'rgba(244,215,124,0.46)' },
  activeCard: { backgroundColor: colors.surfaceElevated },
  freeCard: { paddingVertical: space.sm },
  freeCardCritical: { borderColor: 'rgba(255,113,56,0.44)' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  kicker: { ...type.caption, color: colors.recommendedGoldBright, letterSpacing: 0.85, fontSize: 10 },
  title: { ...type.heading, color: colors.textPrimary, marginTop: 3 },
  freeTitleWrap: { flex: 1, minWidth: 0 },
  freeTitle: { ...type.title, color: colors.textPrimary, marginTop: 2, fontSize: 22, lineHeight: 26, letterSpacing: -0.45, flexShrink: 1 },
  arrow: { color: colors.accentPrimary, fontSize: 27, lineHeight: 30 },
  ctaWell: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: 'rgba(255,113,56,0.08)', borderWidth: 1, borderColor: 'rgba(255,183,137,0.44)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ctaText: { ...type.caption, color: '#F5C2A8', fontSize: 11, fontWeight: '700' },
  detail: { ...type.caption, color: colors.textSecondary, marginTop: space.sm, lineHeight: 18 },
  progressTrack: { height: 4, marginTop: space.md, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: '#2A2F2D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accentPrimary },
  progressFillCritical: { backgroundColor: colors.warning },
  trialCtaWell: { backgroundColor: 'rgba(216,180,90,0.07)', borderColor: 'rgba(216,180,90,0.48)' },
  trialProgressFill: { backgroundColor: colors.accentPrimary },
  freeFooter: { marginTop: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.xs, minWidth: 0, flexWrap: 'wrap' },
  freeFooterReset: { marginTop: 0, flexShrink: 0 },
  freeFooterDot: { ...type.caption, color: colors.textTertiary },
  ready: { ...type.caption, color: colors.textSecondary, lineHeight: 17, flex: 1, minWidth: 0, textAlign: 'right' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
});
