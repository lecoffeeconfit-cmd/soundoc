# Local Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in, local-only Soundoc notifications with useful reminders, document-ready alerts, an optional weekly recap, and a polished Settings configuration area.

**Architecture:** Keep pure notification preferences, eligibility, copy, and trigger planning in testable modules. Keep Expo Notifications permissions, channels, scheduling, cancellation, and response listeners in one native-facing service. Let `App.tsx` own hydrated state and route taps, while a focused Settings component owns the notification controls.

**Tech Stack:** Expo SDK 57, `expo-notifications` `~57.0.14`, React Native, AsyncStorage, TypeScript, existing Soundoc tactile Settings components.

**Spec:** `docs/superpowers/specs/2026-08-25-local-notifications-design.md`

## Global Constraints

- Local on-device notifications only; do not add accounts, remote push tokens, a backend, or `remote-notification` background mode.
- Notifications are opt-in and off by default for new installs.
- Notifications use no badge count, no critical alert, no autoplay, and no full source text or URLs.
- Use Expo SDK 57 notification APIs and config-plugin setup.
- Preserve all existing uncommitted user changes; only modify files required for this feature.
- Write each behavior test before its implementation and run the focused test to observe the expected failure.

### Task 1: Add pure notification preferences, copy, and planning logic

**Files:**
- Create: `src/types/notifications.ts`
- Create: `src/lib/notificationPreferences.ts`
- Create: `src/lib/notificationPlanning.ts`
- Create: `src/lib/notificationPreferences.test.ts`
- Create: `src/lib/notificationPlanning.test.ts`

**Interfaces:**
- `NotificationPreferences`, `NotificationCadence`, `NotificationWeekday`, and `NotificationPermissionState` are the shared notification types.
- `DEFAULT_NOTIFICATION_PREFERENCES`, `normalizeNotificationPreferences(value)`, and `formatNotificationTime(time)` are pure preference helpers.
- `findContinueListeningItem(items)`, `continueListeningContent(item)`, `documentReadyContent(item)`, `weeklyRecapContent(analytics)`, `buildNotificationPlans(preferences, items, analytics, now)` and `notificationResponseTarget(data)` are pure planning helpers.
- `NotificationPlan` uses platform-neutral triggers: `{ kind: 'daily', hour, minute }`, `{ kind: 'weekly', weekday, hour, minute }`, or `{ kind: 'immediate' }`.

- [ ] **Step 1: Write failing preference tests**

  Test that defaults are conservative, malformed persisted values normalize safely, valid times/cadences survive normalization, and time formatting uses a readable 12-hour label.

- [ ] **Step 2: Run the preference test and verify it fails because the helpers do not exist**

  Run: `node --experimental-strip-types src/lib/notificationPreferences.test.ts`
  Expected: FAIL with a module-not-found or missing-export failure.

- [ ] **Step 3: Implement the minimal preference types and helpers**

  Use the defaults from the spec, clamp hours to `0..23`, minutes to `0..59`, accept only `daily`/`weekdays`, and return defaults for non-object input.

- [ ] **Step 4: Run the preference test and verify it passes**

  Run: `node --experimental-strip-types src/lib/notificationPreferences.test.ts`
  Expected: PASS with no warnings.

- [ ] **Step 5: Write failing notification-planning tests**

  Test that plans are empty when disabled/no eligible item, daily cadence creates one Continue Listening plan, weekday cadence creates Monday-Friday plans, the body includes remaining time and a sanitized title, weekly recap is only planned when current-week minutes are positive, and notification tap data returns an item target while unknown data is ignored.

- [ ] **Step 6: Run the planning test and verify it fails for the missing planner**

  Run: `node --experimental-strip-types src/lib/notificationPlanning.test.ts`
  Expected: FAIL with missing module/export failures.

- [ ] **Step 7: Implement the minimal planning and copy helpers**

  Choose the most recently opened unfinished item, require progress or `lastOpenedAt`, round remaining time to a user-friendly minute value, cap title/body lengths, and create quiet plans with stable IDs and item IDs in data.

- [ ] **Step 8: Run the planning test and verify it passes**

  Run: `node --experimental-strip-types src/lib/notificationPlanning.test.ts`
  Expected: PASS with no warnings.

### Task 2: Add Expo Notifications service and app configuration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`
- Create: `src/lib/notifications.ts`
- Create: `src/lib/notifications.test.ts`

**Interfaces:**
- `readNotificationPreferences()` and `writeNotificationPreferences(preferences)` persist the versioned preferences key.
- `getNotificationPermissionState()` and `requestNotificationPermission()` wrap Expo permission APIs.
- `syncScheduledNotifications(preferences, items, analytics, permissionState)` reconciles Soundoc-owned scheduled notifications idempotently.
- `scheduleDocumentReadyNotification(item, permissionState)` schedules a one-off only when the user enabled the category and permission is available.
- `installNotificationResponseListener(onTarget)` returns an unsubscribe function.

- [ ] **Step 1: Write failing service/planning integration tests**

  Test that a scheduling plan maps daily/weekly/immediate trigger kinds to the Expo SDK 57 trigger input shapes, Soundoc-owned requests are cancellable without touching unrelated requests, permission states distinguish denied/provisional/granted, and document-ready content remains privacy-safe.

- [ ] **Step 2: Run the service test and verify it fails before the dependency/service exists**

  Run: `node --experimental-strip-types src/lib/notifications.test.ts`
  Expected: FAIL because `expo-notifications` and the service exports are not available.

- [ ] **Step 3: Install the SDK 57-compatible dependency**

  Run: `npm install expo-notifications@~57.0.14`
  Expected: `package.json` and `package-lock.json` add the dependency without changing unrelated direct dependencies.

- [ ] **Step 4: Add the Expo config plugin and native-safe handler**

  Add the `expo-notifications` plugin with the Soundoc accent color and `soundoc-reading` default Android channel. Configure the handler for quiet notifications: banners/lists allowed when backgrounded, no sound, no badge, and no redundant foreground banner.

- [ ] **Step 5: Implement the persistence, permission, channel, scheduling, and response wrappers**

  Store a notification data marker in every scheduled request, cancel only requests with that marker, create the low-importance Android channel, treat iOS provisional authorization as usable, convert pure plans to Expo triggers, and route item IDs from notification responses.

- [ ] **Step 6: Run the service test and verify it passes**

  Run: `node --experimental-strip-types src/lib/notifications.test.ts`
  Expected: PASS. If Node cannot load the native package in the unit environment, keep the pure mapping exported separately and run the native wrapper checks through TypeScript validation instead of mocking native behavior broadly.

### Task 3: Integrate notification state, scheduling, tap routing, and document-ready events

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/analytics.ts`
- Modify: `App.tsx`
- Modify: `src/lib/largeDocuments.ts` only if a focused completion callback is required

**Interfaces:**
- `SettingsScreen` receives `notificationPreferences`, `notificationPermission`, and notification callbacks from `App.tsx`.
- `openItem(item, false)` remains the tap destination and never autoplays from a notification.

- [ ] **Step 1: Write a failing analytics regression test for current-week recap data**

  Test that weekly listening minutes reset when the local week key changes and that a listening record increments both lifetime and current-week minutes.

- [ ] **Step 2: Run the analytics test and verify it fails because weekly fields do not exist**

  Run: `node --experimental-strip-types src/lib/analytics.test.ts`
  Expected: FAIL with missing field/helper behavior.

- [ ] **Step 3: Add backward-compatible weekly analytics fields and update recording**

  Normalize existing stored analytics to the current week, preserve lifetime totals, and increment current-week minutes during normal listening writes.

- [ ] **Step 4: Run the analytics test and verify it passes**

  Run: `node --experimental-strip-types src/lib/analytics.test.ts`
  Expected: PASS.

- [ ] **Step 5: Load notification preferences and permission state in App.tsx**

  Initialize the channel, load persisted values, keep state separate from speech preferences, and refresh permission status when the app becomes active.

- [ ] **Step 6: Add idempotent sync triggers**

  Sync on hydration, relevant preference changes, active-app transitions, meaningful unfinished-item changes, and analytics changes. Avoid rescheduling on every sentence by using a compact sync key and/or a short debounce.

- [ ] **Step 7: Add document-ready transition handling**

  When a large document transitions to `ready`, schedule the one-off only if the app is not actively showing the prepared flow, the category is enabled, and the item has not already been announced. Do not announce failed, paused, OCR-required, or already-opened items.

- [ ] **Step 8: Add notification response routing**

  Handle both responses received while running and the last response at launch. Resolve the item from the current library, open it paused, and fall back to home/library for deleted or unknown items.

### Task 4: Build the Settings notification section

**Files:**
- Create: `src/components/NotificationSettingsSection.tsx`
- Create: `src/components/NotificationSettingsSection.test.ts`
- Modify: `src/screens/SettingsScreen.tsx`

**Interfaces:**
- `NotificationSettingsSection` accepts normalized preferences, permission state, `onChange`, `onRequestPermission`, and `onOpenSystemSettings` callbacks.

- [ ] **Step 1: Write failing UI-contract tests**

  Test the user-facing labels/copy, master-off state, enabled category defaults, permission-denied copy, and accessibility labels for the toggles/actions.

- [ ] **Step 2: Run the UI-contract test and verify it fails before the component exists**

  Run: `node --experimental-strip-types src/components/NotificationSettingsSection.test.ts`
  Expected: FAIL with missing component/contract exports.

- [ ] **Step 3: Implement the focused Settings component**

  Use the existing colors, spacing, cards, `SoundocToggle`, and modal/time-chip patterns. Keep the master switch prominent, show categories only when enabled, make permission-denied recovery explicit, and keep copy calm and informative.

- [ ] **Step 4: Run the UI-contract test and verify it passes**

  Run: `node --experimental-strip-types src/components/NotificationSettingsSection.test.ts`
  Expected: PASS.

- [ ] **Step 5: Wire the component into SettingsScreen and App.tsx callbacks**

  Place it after `Your listening`, keep Settings layout readable, and ensure changes persist and resync notifications.

### Task 5: Verify the complete feature

**Files:**
- Modify only the files needed to resolve verification failures.

- [ ] **Step 1: Run all notification-focused fixtures**

  Run: `node --experimental-strip-types src/lib/notificationPreferences.test.ts && node --experimental-strip-types src/lib/notificationPlanning.test.ts && node --experimental-strip-types src/lib/notifications.test.ts && node --experimental-strip-types src/lib/analytics.test.ts && node --experimental-strip-types src/components/NotificationSettingsSection.test.ts`
  Expected: PASS for every fixture.

- [ ] **Step 2: Run TypeScript validation**

  Run: `npx tsc --noEmit`
  Expected: no TypeScript errors.

- [ ] **Step 3: Validate Expo configuration**

  Run: `npx expo config --type public`
  Expected: config resolves with the notifications plugin and no schema errors.

- [ ] **Step 4: Review the final diff for scope and safety**

  Run: `git diff --check` and inspect only the notification-related diff paths. Confirm no unrelated user changes were staged or overwritten, no push-token code exists, and no broad notification cancellation is used.

- [ ] **Step 5: Report native testing requirements**

  State that a development/release native rebuild is required to exercise the permission prompt, Android channel, and actual Notification Center delivery; Expo Go can exercise local notification APIs but cannot validate the final native build configuration completely.

