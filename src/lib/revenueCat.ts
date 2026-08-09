import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

export const REVENUECAT_ENTITLEMENT_ID = 'pro';
export const REVENUECAT_OFFERING_ID = 'default';
export const REVENUECAT_MONTHLY_PACKAGE_ID = '$rc_monthly';
export const REVENUECAT_ANNUAL_PACKAGE_ID = '$rc_annual';

function publicKeyForCurrentPlatform() {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return undefined;
}

export function revenueCatConfigurationIssue() {
  if (Constants.appOwnership === 'expo') {
    return 'Soundoc Pro needs a native development build, TestFlight, or the App Store. Purchases are unavailable in Expo Go.';
  }
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return 'Subscriptions are available in the Soundoc iOS app.';
  }

  return Platform.OS === 'ios'
    ? 'Soundoc Pro is not configured yet. Add EXPO_PUBLIC_REVENUECAT_IOS_API_KEY to the build environment.'
    : 'Soundoc Pro is not configured for Android yet.';
}

/** Configure RevenueCat exactly once, using the public key for the running store. */
export async function configureRevenueCat() {
  if (Constants.appOwnership === 'expo') throw new Error(revenueCatConfigurationIssue());
  const apiKey = publicKeyForCurrentPlatform();
  if (!apiKey) throw new Error(revenueCatConfigurationIssue());

  if (__DEV__) await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  if (!(await Purchases.isConfigured())) Purchases.configure({ apiKey });
}

export function messageForRevenueCatError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Soundoc Pro is temporarily unavailable. Please try again.';
}
