# Soundoc RevenueCat setup

Soundoc uses RevenueCat entitlement `pro` and the `default` offering. The iOS client must receive the **Apple App Store public SDK key** from RevenueCat; it must never receive a RevenueCat secret API key or a Test Store key.

## Required environment variable

In RevenueCat, open **Soundoc → Project Settings → API keys → App specific keys**, copy the Apple App Store public SDK key, then add it locally and to EAS:

```sh
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=your_apple_public_sdk_key
```

For local development, copy `.env.example` to `.env.local` and fill in the iOS value. For EAS, add the same value as a `production` (and, when needed, `preview` / `development`) environment variable in the Expo dashboard or with `eas env:create`. `EXPO_PUBLIC_` values are intentionally embedded in the app bundle, which is appropriate only for RevenueCat's public mobile SDK key.

The app is already wired for a future Android public key as `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`; no Android products are assumed or configured.

## RevenueCat mapping

- Entitlement: `pro`
- Current/default offering: `default`
- Monthly package: `$rc_monthly` → `com.lecoffeeconfit.soundoc.pro.monthly`
- Annual package: `$rc_annual` → `com.lecoffeeconfit.soundoc.pro.annual`

Keep both Apple subscriptions in the same subscription group and ensure both packages attach the `pro` entitlement in RevenueCat. The seven-day offer is configured in App Store Connect. Soundoc asks RevenueCat/StoreKit for introductory-offer eligibility and does not create an install-time trial.

## Build and test

`react-native-purchases` requires a native development or EAS build for real purchases. Soundoc deliberately keeps subscriptions unavailable in Expo Go so its preview shim cannot simulate a purchase or entitlement.

```sh
npm install
npx expo config --type public
npx tsc --noEmit
npx expo start --dev-client
eas build --profile development --platform ios
eas build --profile production --platform ios
```

Use an App Store sandbox tester or TestFlight to test Apple purchases. Verify every subscription state against RevenueCat Customer Info and entitlement `pro`, including cancellation, expiration, restore, and offline cached access.
