import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LegalDocument } from '../types/legal';
import { isConfirmedFreeTrial } from '../context/SubscriptionContext';
import { useSubscription } from '../hooks/useSubscription';
import { formatFreeListeningRemaining } from '../lib/freeListening';
import { colors, radius, space, type } from '../lib/theme';

function billingLabel(period: string | null) {
  return period === 'P1Y' ? 'year' : period === 'P1M' ? 'month' : 'billing period';
}

function introLabel(period: string | null) {
  if (period === 'P7D' || period === 'P1W') return '7-day free trial';
  return 'Introductory offer available';
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function SubscriptionPaywall({ onOpenLegal }: { onOpenLegal: (document: LegalDocument) => void }) {
  const subscription = useSubscription();
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const packages = [subscription.annualPackage, subscription.monthlyPackage].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const selectedPackage = packages.find((item) => item.identifier === selectedPackageId) ?? subscription.annualPackage ?? subscription.monthlyPackage ?? null;
  const trialEligible = isConfirmedFreeTrial(selectedPackage, subscription.trialEligibility);
  const activePackage = packages.find((item) => item.product.identifier === subscription.activeProductIdentifier) ?? null;
  const activeExpiration = formatDate(subscription.subscriptionExpirationDate);

  useEffect(() => {
    if (!subscription.isPaywallVisible) return;
    setSelectedPackageId(subscription.annualPackage?.identifier ?? subscription.monthlyPackage?.identifier ?? null);
  }, [subscription.annualPackage?.identifier, subscription.isPaywallVisible, subscription.monthlyPackage?.identifier]);

  useEffect(() => {
    if (!subscription.notice) return;
    Alert.alert(subscription.notice.title, subscription.notice.message, [{ text: 'OK', onPress: subscription.clearNotice }]);
  }, [subscription.clearNotice, subscription.notice]);

  const annualSavings = useMemo(() => {
    const annual = subscription.annualPackage?.product;
    const monthly = subscription.monthlyPackage?.product;
    if (!annual || !monthly || annual.currencyCode !== monthly.currencyCode || monthly.price <= 0) return null;
    const savings = Math.round((1 - annual.price / (monthly.price * 12)) * 100);
    return savings > 0 ? savings : null;
  }, [subscription.annualPackage, subscription.monthlyPackage]);

  const purchase = () => {
    if (!selectedPackage) return;
    if (selectedPackage.identifier === subscription.annualPackage?.identifier) void subscription.purchaseAnnual();
    else void subscription.purchaseMonthly();
  };

  return <Modal visible={subscription.isPaywallVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={subscription.closePaywall}>
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>SOUNDOC PRO</Text><Text style={styles.title}>Listen without limits.</Text></View><Pressable onPress={subscription.closePaywall} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Close Soundoc Pro"><Text style={styles.closeText}>×</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Make articles, documents, and notes feel made for listening—with the controls that help you focus.</Text>
        {subscription.isFree && <View style={styles.freePlanNote}><Text style={styles.freePlanKicker}>YOUR SOUNDOC FREE PLAN</Text><Text style={styles.freePlanTitle}>{formatFreeListeningRemaining(subscription.freeListeningSecondsRemaining)} this week</Text><Text style={styles.freePlanText}>{subscription.freeResetLabel ?? 'Resets Monday'}. Imports, your Library, standard device voices, and core listening controls remain available.</Text></View>}
        <View style={styles.features}><Feature text="Turn documents and articles into focused listening" /><Feature text="Fine-tune voice, speed, pitch, and reading pauses" /><Feature text="Use Soundoc summaries and learning tools" /></View>

        {subscription.isPro ? <>
          <Text style={styles.sectionLabel}>YOUR SUBSCRIPTION</Text>
          <View style={styles.activeSummary}><Text style={styles.activeSummaryTitle}>{subscription.isTrialing ? 'Soundoc Pro Trial' : 'Soundoc Pro'}</Text><Text style={styles.activeSummaryText}>{subscription.isCancellationPending && activeExpiration ? `Active until ${activeExpiration}` : subscription.isTrialing && activeExpiration ? `Trial ends ${activeExpiration}` : subscription.willRenew && activeExpiration ? `Renews ${activeExpiration}` : 'Active'}</Text>{subscription.isTrialing && activePackage && <Text style={styles.activeSummaryDetail}>Then {activePackage.product.priceString}/{billingLabel(activePackage.product.subscriptionPeriod)} unless canceled.</Text>}</View>
          <Pressable onPress={() => void subscription.openSubscriptionManagement()} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Manage Soundoc Pro subscription"><Text style={styles.primaryText}>Manage Subscription</Text></Pressable>
          <Text style={styles.disclosure}>Your subscription is managed through the App Store. You can review billing, switch plans, or cancel there.</Text>
        </> : <>
          <Text style={styles.sectionLabel}>CHOOSE YOUR PLAN</Text>
          {packages.map((item) => {
            const selected = item.identifier === selectedPackage?.identifier;
            const annual = item.identifier === subscription.annualPackage?.identifier;
            const eligible = isConfirmedFreeTrial(item, subscription.trialEligibility);
            return <Pressable key={item.identifier} onPress={() => setSelectedPackageId(item.identifier)} style={({ pressed }) => [styles.plan, selected && styles.planSelected, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${annual ? 'Annual' : 'Monthly'} plan, ${item.product.priceString} per ${billingLabel(item.product.subscriptionPeriod)}`}>
              <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View><View style={styles.planCopy}><View style={styles.planTitleRow}><Text style={styles.planTitle}>{annual ? 'Annual' : 'Monthly'}</Text>{annual && <View style={styles.recommended}><Text style={styles.recommendedText}>RECOMMENDED</Text></View>}</View><Text style={styles.planPrice}>{item.product.priceString}<Text style={styles.planPeriod}> / {billingLabel(item.product.subscriptionPeriod)}</Text></Text>{annualSavings && annual ? <Text style={styles.savings}>Save {annualSavings}% compared with monthly</Text> : eligible ? <Text style={styles.savings}>{introLabel(item.product.introPrice?.period ?? null)}</Text> : null}</View>
            </Pressable>;
          })}
          {subscription.error && <View style={styles.error}><Text style={styles.errorText}>{subscription.error}</Text></View>}
          {!packages.length && !subscription.error && <View style={styles.error}><Text style={styles.errorText}>Plans are not available right now. Check your connection or try again later.</Text></View>}
          <Pressable disabled={!selectedPackage || subscription.isPurchasing} onPress={purchase} style={({ pressed }) => [styles.primary, (!selectedPackage || subscription.isPurchasing) && styles.primaryDisabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ disabled: !selectedPackage || subscription.isPurchasing }} accessibilityLabel={trialEligible ? 'Start 7-day free trial' : 'Subscribe'}>
            {subscription.isPurchasing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{trialEligible ? 'Start 7-Day Free Trial' : 'Subscribe'}</Text>}
          </Pressable>
          <Text style={styles.disclosure}>{trialEligible && selectedPackage ? `Then ${selectedPackage.product.priceString}/${billingLabel(selectedPackage.product.subscriptionPeriod)}. ` : ''}Payment will be charged to your Apple ID. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Manage or cancel anytime in App Store subscription settings.</Text>
        </>}
        <View style={styles.utilityRow}><Pressable onPress={() => void subscription.restorePurchases()} disabled={subscription.isPurchasing} accessibilityRole="button" accessibilityLabel="Restore purchases"><Text style={styles.utility}>Restore Purchases</Text></Pressable><View style={styles.utilityDivider} /><Pressable onPress={() => onOpenLegal('terms')} accessibilityRole="link"><Text style={styles.utility}>Terms of Use</Text></Pressable><View style={styles.utilityDivider} /><Pressable onPress={() => onOpenLegal('privacy')} accessibilityRole="link"><Text style={styles.utility}>Privacy Policy</Text></Pressable></View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function Feature({ text }: { text: string }) { return <View style={styles.feature}><View style={styles.featureMark}><Text style={styles.featureMarkText}>✓</Text></View><Text style={styles.featureText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundPrimary }, header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md }, eyebrow: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1.2, fontSize: 10 }, title: { ...type.display, color: colors.textPrimary, fontSize: 30, marginTop: 5 }, close: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle }, closeText: { color: colors.textSecondary, fontSize: 27, lineHeight: 29 }, scroll: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: space.xl, paddingBottom: space.xxxl }, subtitle: { ...type.body, color: colors.textSecondary, lineHeight: 23 }, freePlanNote: { marginTop: space.lg, padding: space.md, borderRadius: radius.large, backgroundColor: 'rgba(216,180,90,0.10)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.28)' }, freePlanKicker: { ...type.caption, color: colors.recommendedGoldBright, letterSpacing: 0.8, fontSize: 10 }, freePlanTitle: { ...type.heading, color: colors.textPrimary, marginTop: 3 }, freePlanText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 4 }, features: { marginTop: space.xl, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle, gap: space.sm }, feature: { flexDirection: 'row', alignItems: 'center', gap: space.sm }, featureMark: { width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }, featureMarkText: { color: colors.accentPrimary, fontSize: 13, fontWeight: '800' }, featureText: { ...type.label, color: colors.textPrimary, flex: 1, lineHeight: 20 }, sectionLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 1, marginTop: space.xxl, marginBottom: space.sm }, activeSummary: { padding: space.lg, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle }, activeSummaryTitle: { ...type.heading, color: colors.textPrimary }, activeSummaryText: { ...type.body, color: colors.success, marginTop: 4 }, activeSummaryDetail: { ...type.caption, color: colors.textSecondary, marginTop: space.sm, lineHeight: 18 }, plan: { minHeight: 94, marginBottom: space.sm, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle, flexDirection: 'row', alignItems: 'center', gap: space.sm }, planSelected: { backgroundColor: '#251C18', borderColor: colors.accentPrimary }, radio: { width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.textTertiary }, radioSelected: { borderColor: colors.accentPrimary }, radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.accentPrimary }, planCopy: { flex: 1, minWidth: 0 }, planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }, planTitle: { ...type.heading, color: colors.textPrimary }, recommended: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.accentSoft }, recommendedText: { ...type.caption, color: colors.accentPrimary, fontSize: 9, letterSpacing: 0.5, fontWeight: '700' }, planPrice: { ...type.label, color: colors.textPrimary, marginTop: 3 }, planPeriod: { color: colors.textSecondary }, savings: { ...type.caption, color: colors.success, marginTop: 3 }, error: { marginTop: space.sm, padding: space.sm, borderRadius: radius.medium, backgroundColor: 'rgba(255,92,92,0.10)', borderWidth: 1, borderColor: 'rgba(255,92,92,0.28)' }, errorText: { ...type.caption, color: '#FFB0B0', lineHeight: 18 }, primary: { minHeight: 54, marginTop: space.lg, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.24, shadowOffset: { width: 0, height: 7 }, shadowRadius: 13, elevation: 5 }, primaryDisabled: { opacity: 0.55 }, primaryText: { ...type.heading, color: '#FFFFFF' }, disclosure: { ...type.caption, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, marginTop: space.md }, utilityRow: { marginTop: space.lg, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: space.xs }, utility: { ...type.caption, color: colors.accentPrimary, paddingVertical: space.xs }, utilityDivider: { width: 1, height: 12, backgroundColor: colors.divider }, pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
});
