# Soundoc RevenueCat setup

Soundoc uses RevenueCat entitlement `pro` and the `default` offering. Each native store build must receive that store's **app-specific public SDK key** from RevenueCat; never put a RevenueCat secret API key or Test Store key in the app.

## Required environment variable

In RevenueCat, open **Soundoc → Project Settings → API keys → App specific keys** and add the platform-specific values locally and to EAS:

```sh
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=your_apple_public_sdk_key
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=your_google_play_public_sdk_key
```

For local development, copy `.env.example` to `.env.local` and fill in the iOS value. For EAS, add the same value to the `development`, `preview`, and `production` environments in the Expo dashboard or with `eas env:set`. Soundoc's EAS profiles explicitly select those matching environments. `EXPO_PUBLIC_` values are intentionally embedded in the app bundle, which is appropriate only for RevenueCat's public mobile SDK key.

The Android build reads `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`; the iOS build reads `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`. These values are embedded in the app bundle, which is appropriate only for RevenueCat's public mobile SDK keys.

## RevenueCat mapping

- Entitlement: `pro`
- Current/default offering: `default`
- Monthly package: `$rc_monthly` → the platform's monthly store product
- Annual package: `$rc_annual` → the platform's annual store product

Create the monthly and annual products in both stores, attach them to the matching RevenueCat packages, and attach both packages to the `pro` entitlement. The Android Play product IDs and the seven-day introductory offer must be configured manually in Google Play Console and RevenueCat; this repository does not invent or assume those IDs. Keep both Apple subscriptions in the same subscription group. Soundoc asks RevenueCat for introductory-offer eligibility and does not create an install-time trial.

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

If a local build says the API key is missing, run `eas env:pull --environment development` (or create `.env.local` from `.env.example`) and restart Expo. Environment values are embedded when the JavaScript bundle is built, so an already-installed build will not receive a newly added key until it is rebuilt or reloaded with the configured environment.

Use an App Store sandbox tester/TestFlight and Google Play license testers/internal testing to test purchases. Verify every subscription state against RevenueCat Customer Info and entitlement `pro`, including cancellation, expiration, restore, and offline cached access.
