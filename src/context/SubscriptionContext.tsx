import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, { type CustomerInfo, INTRO_ELIGIBILITY_STATUS, type IntroEligibility, type PurchasesOffering, type PurchasesPackage } from 'react-native-purchases';
import { consumeFreeListeningUsage, createFreeListeningUsage, FREE_LISTENING_STORAGE_KEY, freeListeningResetLabel, freeUsagePercent, localWeekResetDate, normalizeFreeListeningUsage, type FreeListeningUpdate, type FreeListeningUsage, validateFreeListeningUsage } from '../lib/freeListening';
import { configureRevenueCat, messageForRevenueCatError, REVENUECAT_ANNUAL_PACKAGE_ID, REVENUECAT_ENTITLEMENT_ID, REVENUECAT_MONTHLY_PACKAGE_ID, REVENUECAT_OFFERING_ID, revenueCatConfigurationIssue } from '../lib/revenueCat';

type SubscriptionNotice = { title: string; message: string } | null;

type SubscriptionContextValue = {
  isInitialized: boolean;
  isLoading: boolean;
  isPurchasing: boolean;
  isPro: boolean;
  isTrialing: boolean;
  isFree: boolean;
  isPlaybackAccessReady: boolean;
  freeListeningSecondsRemaining: number;
  freeUsagePercent: number;
  freeResetDate: number | null;
  freeResetLabel: string | null;
  canStartPlayback: () => boolean;
  consumeFreeListening: (elapsedSeconds: number) => Pick<FreeListeningUpdate, 'remainingSeconds' | 'reachedLimit' | 'crossedLowAllowance'>;
  refreshFreeListeningUsage: () => void;
  trialExpirationDate: string | null;
  trialDaysRemaining: number | null;
  subscriptionExpirationDate: string | null;
  activeProductIdentifier: string | null;
  willRenew: boolean | null;
  isCancellationPending: boolean;
  managementURL: string | null;
  currentOffering: PurchasesOffering | null;
  monthlyPackage: PurchasesPackage | null;
  annualPackage: PurchasesPackage | null;
  trialEligibility: Record<string, IntroEligibility>;
  error: string | null;
  notice: SubscriptionNotice;
  isPaywallVisible: boolean;
  refreshCustomerInfo: () => Promise<void>;
  purchaseMonthly: () => Promise<boolean>;
  purchaseAnnual: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  openSubscriptionManagement: () => Promise<void>;
  openPaywall: () => void;
  closePaywall: () => void;
  requirePro: (onAllowed?: () => void) => boolean;
  clearNotice: () => void;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
const DAY_MS = 24 * 60 * 60 * 1000;

function futureDaysRemaining(expirationDate: string | null, now = Date.now()) {
  if (!expirationDate) return null;
  const milliseconds = new Date(expirationDate).getTime() - now;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
  return Math.ceil(milliseconds / DAY_MS);
}

function findPackage(offering: PurchasesOffering | null, identifier: string) {
  return offering?.availablePackages.find((item) => item.identifier === identifier) ?? null;
}

export function isConfirmedFreeTrial(packageToCheck: PurchasesPackage | null, eligibility: Record<string, IntroEligibility>) {
  if (!packageToCheck) return false;
  const intro = packageToCheck.product.introPrice;
  return eligibility[packageToCheck.product.identifier]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
    && intro?.price === 0
    && (intro.period === 'P7D' || intro.period === 'P1W');
}

export function SubscriptionProvider({ children }: PropsWithChildren) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [hasResolvedEntitlement, setHasResolvedEntitlement] = useState(false);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [trialEligibility, setTrialEligibility] = useState<Record<string, IntroEligibility>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<SubscriptionNotice>(null);
  const [isPaywallVisible, setIsPaywallVisible] = useState(false);
  const [trialClock, setTrialClock] = useState(() => Date.now());
  const [freeUsage, setFreeUsage] = useState<FreeListeningUsage | null>(null);
  const configured = useRef(false);
  const expiredTrialRefresh = useRef<string | null>(null);
  const freeUsageRef = useRef<FreeListeningUsage | null>(null);
  const freeUsageWrite = useRef<Promise<void>>(Promise.resolve());

  const applyCustomerInfo = useCallback((info: CustomerInfo) => {
    setCustomerInfo(info);
    setHasResolvedEntitlement(true);
    setError(null);
  }, []);

  const persistFreeUsage = useCallback((next: FreeListeningUsage) => {
    freeUsageWrite.current = freeUsageWrite.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(FREE_LISTENING_STORAGE_KEY, JSON.stringify(next)))
      .catch(() => undefined);
  }, []);

  const setCurrentFreeUsage = useCallback((next: FreeListeningUsage, persist = true) => {
    freeUsageRef.current = next;
    setFreeUsage(next);
    if (persist) persistFreeUsage(next);
  }, [persistFreeUsage]);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(FREE_LISTENING_STORAGE_KEY).then((stored) => {
      let next = createFreeListeningUsage();
      if (stored) {
        try {
          const validated = validateFreeListeningUsage(JSON.parse(stored));
          next = normalizeFreeListeningUsage(validated).usage;
        } catch {
          next = createFreeListeningUsage();
        }
      }
      if (!mounted) return;
      setCurrentFreeUsage(next, !stored || stored !== JSON.stringify(next));
    }).catch(() => {
      if (mounted) setCurrentFreeUsage(createFreeListeningUsage());
    });
    return () => { mounted = false; };
  }, [setCurrentFreeUsage]);

  const loadOffering = useCallback(async () => {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.current?.identifier === REVENUECAT_OFFERING_ID
      ? offerings.current
      : offerings.all[REVENUECAT_OFFERING_ID] ?? null;
    setCurrentOffering(offering);

    const productIdentifiers = offering?.availablePackages.map((item) => item.product.identifier) ?? [];
    setTrialEligibility(productIdentifiers.length ? await Purchases.checkTrialOrIntroductoryPriceEligibility(productIdentifiers) : {});
  }, []);

  const refreshCustomerInfo = useCallback(async () => {
    if (!configured.current) return;
    try {
      applyCustomerInfo(await Purchases.getCustomerInfo());
    } catch (refreshError) {
      // Keep cached entitlement state visible if a foreground refresh cannot reach the store.
      setError(messageForRevenueCatError(refreshError));
    }
  }, [applyCustomerInfo]);

  useEffect(() => {
    let mounted = true;
    let listener: ((info: CustomerInfo) => void) | null = null;

    const initialize = async () => {
      try {
        await configureRevenueCat();
        configured.current = true;
        listener = (info) => { if (mounted) applyCustomerInfo(info); };
        Purchases.addCustomerInfoUpdateListener(listener);

        const [infoResult, offeringResult] = await Promise.allSettled([Purchases.getCustomerInfo(), loadOffering()]);
        if (!mounted) return;
        if (infoResult.status === 'fulfilled') applyCustomerInfo(infoResult.value);
        if (infoResult.status === 'rejected') setError(messageForRevenueCatError(infoResult.reason));
        if (offeringResult.status === 'rejected') setError(messageForRevenueCatError(offeringResult.reason));
      } catch (initializationError) {
        if (mounted) setError(messageForRevenueCatError(initializationError));
      } finally {
        if (mounted) { setIsInitialized(true); setIsLoading(false); }
      }
    };

    void initialize();
    return () => {
      mounted = false;
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [applyCustomerInfo, loadOffering]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refreshCustomerInfo();
    });
    return () => subscription.remove();
  }, [refreshCustomerInfo]);

  const activeEntitlement = customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENT_ID] ?? null;
  const isPro = activeEntitlement?.isActive === true;
  const isTrialing = isPro && activeEntitlement?.periodType === 'TRIAL';
  const subscriptionExpirationDate = activeEntitlement?.expirationDate ?? null;
  const trialExpirationDate = isTrialing ? subscriptionExpirationDate : null;
  const monthlyPackage = findPackage(currentOffering, REVENUECAT_MONTHLY_PACKAGE_ID);
  const annualPackage = findPackage(currentOffering, REVENUECAT_ANNUAL_PACKAGE_ID);
  // A failed store refresh must not immediately downgrade a cached Premium listener.
  const isFree = isInitialized && !isPro && (hasResolvedEntitlement || !configured.current);
  const isPlaybackAccessReady = !isFree || freeUsageRef.current !== null;

  const refreshFreeListeningUsage = useCallback(() => {
    const normalized = normalizeFreeListeningUsage(freeUsageRef.current);
    const current = freeUsageRef.current;
    if (!current || current.periodStart !== normalized.usage.periodStart || current.usedSeconds !== normalized.usage.usedSeconds || current.lowAllowanceNoticeShown !== normalized.usage.lowAllowanceNoticeShown) {
      setCurrentFreeUsage(normalized.usage);
    }
  }, [setCurrentFreeUsage]);

  const canStartPlayback = useCallback(() => {
    if (!isFree) return true;
    if (!freeUsageRef.current) return false;
    const normalized = normalizeFreeListeningUsage(freeUsageRef.current);
    const current = freeUsageRef.current;
    if (!current || current.periodStart !== normalized.usage.periodStart || current.usedSeconds !== normalized.usage.usedSeconds || current.lowAllowanceNoticeShown !== normalized.usage.lowAllowanceNoticeShown) {
      setCurrentFreeUsage(normalized.usage);
    }
    return normalized.remainingSeconds > 0;
  }, [isFree, setCurrentFreeUsage]);

  const consumeFreeListening = useCallback((elapsedSeconds: number) => {
    if (!isFree) return { remainingSeconds: Number.POSITIVE_INFINITY, reachedLimit: false, crossedLowAllowance: false };
    const update = consumeFreeListeningUsage(freeUsageRef.current, elapsedSeconds);
    setCurrentFreeUsage(update.usage);
    return { remainingSeconds: update.remainingSeconds, reachedLimit: update.reachedLimit, crossedLowAllowance: update.crossedLowAllowance };
  }, [isFree, setCurrentFreeUsage]);

  useEffect(() => {
    if (!isFree || !freeUsage) return;
    const untilReset = Math.max(1_000, localWeekResetDate() - Date.now() + 50);
    const timer = setTimeout(refreshFreeListeningUsage, untilReset);
    return () => clearTimeout(timer);
  }, [freeUsage, isFree, refreshFreeListeningUsage]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshFreeListeningUsage();
    });
    return () => subscription.remove();
  }, [refreshFreeListeningUsage]);

  useEffect(() => {
    if (!trialExpirationDate) return;
    const expiration = new Date(trialExpirationDate).getTime();
    const remaining = expiration - Date.now();
    const days = futureDaysRemaining(trialExpirationDate);
    if (!Number.isFinite(expiration) || days === null) return;
    if (days === 0) {
      if (expiredTrialRefresh.current !== trialExpirationDate) {
        expiredTrialRefresh.current = trialExpirationDate;
        void refreshCustomerInfo();
      }
      return;
    }
    const untilNextDisplayChange = remaining - (days - 1) * DAY_MS;
    const timer = setTimeout(() => setTrialClock(Date.now()), Math.max(1_000, untilNextDisplayChange + 50));
    return () => clearTimeout(timer);
  }, [refreshCustomerInfo, trialClock, trialExpirationDate]);

  useEffect(() => {
    if (!isPro || !subscriptionExpirationDate) return;
    const expiration = new Date(subscriptionExpirationDate).getTime();
    if (!Number.isFinite(expiration)) return;
    const remaining = expiration - Date.now();
    if (remaining <= 0) { void refreshCustomerInfo(); return; }
    const timer = setTimeout(() => void refreshCustomerInfo(), remaining + 100);
    return () => clearTimeout(timer);
  }, [isPro, refreshCustomerInfo, subscriptionExpirationDate]);

  const purchase = useCallback(async (packageToPurchase: PurchasesPackage | null) => {
    if (!packageToPurchase) {
      setError('This subscription option is currently unavailable. Please try again later.');
      return false;
    }
    if (!configured.current) {
      setError(revenueCatConfigurationIssue());
      return false;
    }

    setIsPurchasing(true);
    setError(null);
    try {
      const { customerInfo: purchasedInfo } = await Purchases.purchasePackage(packageToPurchase);
      applyCustomerInfo(purchasedInfo);
      const hasEntitlement = purchasedInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID]?.isActive === true;
      if (!hasEntitlement) {
        setError('Your purchase was completed, but Soundoc Pro is still being confirmed. Please try Restore Purchases in a moment.');
        return false;
      }
      setNotice({ title: 'Soundoc Pro is ready', message: 'Your subscription is active on this device.' });
      setIsPaywallVisible(false);
      return true;
    } catch (purchaseError) {
      const cancelled = purchaseError && typeof purchaseError === 'object' && (
        ('userCancelled' in purchaseError && purchaseError.userCancelled === true)
        || ('code' in purchaseError && purchaseError.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
      );
      if (!cancelled) setError(messageForRevenueCatError(purchaseError));
      return false;
    } finally {
      setIsPurchasing(false);
    }
  }, [applyCustomerInfo]);

  const restorePurchases = useCallback(async () => {
    if (!configured.current) {
      setError(revenueCatConfigurationIssue());
      return false;
    }
    setIsPurchasing(true);
    setError(null);
    try {
      const restoredInfo = await Purchases.restorePurchases();
      applyCustomerInfo(restoredInfo);
      const restored = restoredInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID]?.isActive === true;
      setNotice(restored
        ? { title: 'Purchases restored', message: 'Soundoc Pro is active on this device.' }
        : { title: 'Nothing to restore', message: 'We could not find an active Soundoc Pro subscription for this App Store account.' });
      return restored;
    } catch (restoreError) {
      setError(messageForRevenueCatError(restoreError));
      return false;
    } finally {
      setIsPurchasing(false);
    }
  }, [applyCustomerInfo]);

  const openSubscriptionManagement = useCallback(async () => {
    const managementURL = customerInfo?.managementURL;
    if (!managementURL) {
      setNotice({ title: 'No subscription to manage', message: 'An App Store management link will appear here while Soundoc Pro is active.' });
      return;
    }
    try {
      await Linking.openURL(managementURL);
    } catch {
      setError('Couldn’t open App Store subscription management. Please try again.');
    }
  }, [customerInfo?.managementURL]);

  const openPaywall = useCallback(() => {
    setError(null);
    setIsPaywallVisible(true);
    if (configured.current && currentOffering) void Purchases.trackCustomPaywallImpression({ offering: currentOffering }).catch(() => undefined);
  }, [currentOffering]);
  const closePaywall = useCallback(() => setIsPaywallVisible(false), []);
  const requirePro = useCallback((onAllowed?: () => void) => {
    if (!isInitialized) {
      setNotice({ title: 'Checking Soundoc Pro', message: 'Please try again in a moment while we confirm your subscription.' });
      return false;
    }
    if (activeEntitlement?.isActive) { onAllowed?.(); return true; }
    openPaywall();
    return false;
  }, [activeEntitlement?.isActive, isInitialized, openPaywall]);
  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<SubscriptionContextValue>(() => ({
    isInitialized, isLoading, isPurchasing, isPro, isTrialing, isFree, isPlaybackAccessReady,
    freeListeningSecondsRemaining: isFree ? normalizeFreeListeningUsage(freeUsage).remainingSeconds : 0,
    freeUsagePercent: isFree ? freeUsagePercent(freeUsage) : 0,
    freeResetDate: isFree ? localWeekResetDate() : null,
    freeResetLabel: isFree ? freeListeningResetLabel() : null,
    canStartPlayback, consumeFreeListening, refreshFreeListeningUsage,
    trialExpirationDate, trialDaysRemaining: isTrialing ? futureDaysRemaining(trialExpirationDate, trialClock) : null,
    subscriptionExpirationDate, activeProductIdentifier: activeEntitlement?.productIdentifier ?? null,
    willRenew: activeEntitlement?.willRenew ?? null,
    isCancellationPending: isPro && (activeEntitlement?.willRenew === false || Boolean(activeEntitlement?.unsubscribeDetectedAt)),
    managementURL: customerInfo?.managementURL ?? null,
    currentOffering, monthlyPackage, annualPackage, trialEligibility, error, notice, isPaywallVisible,
    refreshCustomerInfo, purchaseMonthly: () => purchase(monthlyPackage), purchaseAnnual: () => purchase(annualPackage), restorePurchases,
    openSubscriptionManagement, openPaywall, closePaywall, requirePro, clearNotice,
  }), [activeEntitlement, annualPackage, canStartPlayback, clearNotice, closePaywall, consumeFreeListening, currentOffering, customerInfo?.managementURL, error, freeUsage, isFree, isInitialized, isLoading, isPaywallVisible, isPlaybackAccessReady, isPro, isPurchasing, isTrialing, monthlyPackage, notice, openPaywall, openSubscriptionManagement, purchase, refreshCustomerInfo, refreshFreeListeningUsage, requirePro, restorePurchases, subscriptionExpirationDate, trialClock, trialEligibility, trialExpirationDate]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used inside SubscriptionProvider.');
  return context;
}
