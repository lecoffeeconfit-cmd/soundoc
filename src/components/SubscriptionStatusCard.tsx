import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
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

function useSystemReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReduceMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  return reduceMotion;
}

function FreeListeningProgress({ value, reduceMotion }: { value: number; reduceMotion: boolean }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const [fillWidth, setFillWidth] = useState(0);
  const visible = value > 0;
  const shimmerWidth = Math.max(36, fillWidth * 0.38);

  useEffect(() => {
    shimmer.stopAnimation();
    shimmer.setValue(0);
    if (reduceMotion || !visible || !fillWidth) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(700),
      Animated.timing(shimmer, { toValue: 1, duration: 3600, useNativeDriver: true }),
      Animated.delay(800),
    ]));
    animation.start();
    return () => animation.stop();
  }, [fillWidth, reduceMotion, shimmer, visible]);

  return <View style={styles.progressTrack} accessibilityElementsHidden>
    {visible && <View onLayout={(event) => setFillWidth(event.nativeEvent.layout.width)} style={[styles.progressFillClip, { width: `${value * 100}%` }]}>
      <LinearGradient colors={[colors.recommendedGoldBright, colors.accentPrimary]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      {!reduceMotion && fillWidth > 0 && <Animated.View pointerEvents="none" style={[styles.progressShimmer, { width: shimmerWidth, transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-shimmerWidth, fillWidth] }) }] }]} />}
    </View>}
  </View>;
}

export function SubscriptionStatusCard({ readyListeningSeconds = 0 }: { readyListeningSeconds?: number }) {
  const subscription = useSubscription();
  const reduceMotion = useSystemReduceMotion();
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
    const exhausted = remaining <= 0;
    const remainingProgress = exhausted ? 0 : Math.max(0, Math.min(1, 1 - subscription.freeUsagePercent));
    const remainingLabel = formatFreeListeningRemaining(remaining);
    const ready = readyListeningSeconds > 0 ? `${formatDuration(readyListeningSeconds).replace('About ', '')} ready in Library` : 'Library ready when you are';
    const resetLabel = subscription.freeResetLabel ?? 'Weekly reset';
    return <LinearGradient colors={exhausted ? ['rgba(244,215,124,0.38)', 'rgba(255,113,56,0.48)'] : ['rgba(244,215,124,0.42)', 'rgba(216,180,90,0.24)', 'rgba(255,113,56,0.38)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.freeCardGradient}>
      <Pressable onPress={subscription.openPaywall} style={({ pressed }) => [styles.card, styles.freeCard, critical && styles.freeCardCritical, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Soundoc Free. ${remainingLabel}. ${resetLabel}. Go Unlimited.`} accessibilityValue={{ text: `${remainingLabel}. ${resetLabel}. ${ready}` }} accessibilityHint="Opens unlimited listening plans">
        <View pointerEvents="none" style={styles.freeAmbientTopLeft} /><View pointerEvents="none" style={styles.freeAmbientBottomRight} />
        <View style={styles.header}><View style={styles.freeTitleWrap}><Text style={styles.kicker}>FREE LISTENING</Text><Text style={[styles.freeTitle, exhausted && styles.freeTitleExhausted]}>{remainingLabel}</Text></View><Pressable onPress={(event) => { event.stopPropagation(); subscription.openPaywall(); }} style={({ pressed }) => [styles.ctaWell, styles.freeCtaWell, exhausted && styles.freeCtaWellExhausted, pressed && styles.freeCtaPressed]} accessibilityRole="button" accessibilityLabel="Go Unlimited"><Text style={styles.ctaText} numberOfLines={1}>Go Unlimited</Text></Pressable></View>
        <FreeListeningProgress value={remainingProgress} reduceMotion={reduceMotion} />
        <View style={styles.freeFooter}><Text style={[styles.detail, styles.freeFooterReset]}>{resetLabel}</Text><Text style={styles.freeFooterDot}>·</Text><Text style={styles.ready} numberOfLines={1}>{ready}</Text></View>
      </Pressable>
    </LinearGradient>;
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
  freeCardGradient: { width: '100%', maxWidth: 620, alignSelf: 'center', marginTop: space.lg, padding: 1, overflow: 'hidden', borderRadius: radius.large, shadowColor: colors.recommendedGold, shadowOpacity: 0.07, shadowOffset: { width: 0, height: 6 }, shadowRadius: 16, elevation: 4 },
  freeCard: { marginTop: 0, paddingVertical: 10, overflow: 'hidden', backgroundColor: '#1B1F20', borderWidth: 0, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  freeCardCritical: { backgroundColor: '#201D1B' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  kicker: { ...type.caption, color: colors.recommendedGoldBright, letterSpacing: 0.85, fontSize: 10 },
  title: { ...type.heading, color: colors.textPrimary, marginTop: 3 },
  freeTitleWrap: { flex: 1, minWidth: 0 },
  freeTitle: { ...type.title, color: colors.textPrimary, marginTop: 2, fontSize: 22, lineHeight: 26, letterSpacing: -0.45, flexShrink: 1 },
  freeTitleExhausted: { color: '#F2B394' },
  arrow: { color: colors.accentPrimary, fontSize: 27, lineHeight: 30 },
  ctaWell: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: 'rgba(255,113,56,0.08)', borderWidth: 1, borderColor: 'rgba(255,183,137,0.44)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  freeCtaWell: { minHeight: 32, paddingHorizontal: space.sm, backgroundColor: 'rgba(255,113,56,0.05)', borderColor: 'rgba(255,183,137,0.30)' },
  freeCtaWellExhausted: { borderColor: 'rgba(255,158,106,0.48)', shadowColor: colors.accentPrimary, shadowOpacity: 0.09, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, elevation: 2 },
  freeCtaPressed: { transform: [{ scale: 0.98 }], backgroundColor: 'rgba(255,113,56,0.12)', borderColor: 'rgba(255,198,161,0.66)' },
  ctaText: { ...type.caption, color: '#F5C2A8', fontSize: 11, fontWeight: '700' },
  detail: { ...type.caption, color: colors.textSecondary, marginTop: space.sm, lineHeight: 18 },
  progressTrack: { height: 4, marginTop: 10, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: '#2A2F2D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accentPrimary },
  progressFillCritical: { backgroundColor: colors.warning },
  progressFillClip: { height: '100%', overflow: 'hidden', borderRadius: radius.pill },
  progressShimmer: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.pill, backgroundColor: 'rgba(255,248,222,0.22)' },
  trialCtaWell: { backgroundColor: 'rgba(216,180,90,0.07)', borderColor: 'rgba(216,180,90,0.48)' },
  trialProgressFill: { backgroundColor: colors.accentPrimary },
  freeFooter: { marginTop: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.xs, minWidth: 0, flexWrap: 'wrap' },
  freeFooterReset: { marginTop: 0, flexShrink: 0 },
  freeFooterDot: { ...type.caption, color: colors.textTertiary },
  ready: { ...type.caption, color: colors.textSecondary, lineHeight: 17, flex: 1, minWidth: 0, textAlign: 'right' },
  freeAmbientTopLeft: { position: 'absolute', width: 160, height: 72, borderRadius: radius.pill, backgroundColor: colors.recommendedGold, opacity: 0.025, top: -38, left: -44 },
  freeAmbientBottomRight: { position: 'absolute', width: 130, height: 64, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, opacity: 0.022, right: -36, bottom: -34 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
});
