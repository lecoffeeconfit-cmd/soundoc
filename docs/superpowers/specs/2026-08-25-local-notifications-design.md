# Soundoc Local Notifications Design

## Goal

Add a privacy-preserving, opt-in local notification system that helps Soundoc users return to unfinished listening, understand when a long document is ready, and optionally review a calm weekly listening recap. The experience should feel like a helpful reading companion, not an engagement system.

## Scope

This version uses on-device scheduled notifications only. It does not add accounts, remote push tokens, a server, cloud sync, notification analytics, or notification-driven autoplay.

The feature must work with Soundoc's existing local-first storage model and Expo SDK 57. It requires `expo-notifications`, an Expo config plugin entry, local permission handling, Android channel setup, and a native rebuild after installation.

## User experience

### Settings entry

Add a dedicated `Notifications` section to Settings after `Your listening` and before `Appearance`. The section should use Soundoc's existing raised graphite/tactile visual language.

The section contains:

1. A master `Helpful notifications` switch. It is off by default for new installs and remains off until the user explicitly enables it.
2. A short explanation: `Private, on-device reminders for your Soundoc library.`
3. Permission status copy. When permission is not determined, enabling the switch requests permission. When permission is denied, the section says `Notifications are disabled in iPhone Settings` and offers `Open iPhone Settings` rather than repeatedly asking.
4. Category controls visible when enabled:
   - `Continue listening`: daily or weekday reminder at a chosen time. The reminder is only scheduled when there is an unfinished item with meaningful progress or a recent open state.
   - `Document ready`: a one-time, quiet notification after a long document finishes preparation. It includes the document title and is never used to start playback.
   - `Weekly listening recap`: an optional weekly passive notification at a chosen day and time. It is only scheduled when the user has listened during the current week and uses local analytics.
5. A compact quiet-hours note: `Soundoc keeps reminders gentle: no badge count, no critical alerts, and no reminder while you are actively listening.`

The settings UI should avoid a large form. Use a clear master card, readable rows, compact toggle controls, and small time/cadence choice sheets or chips that follow the existing Settings modal patterns. All interactive controls need accessibility labels and state.

### Notification copy

Notifications should be specific and informative:

- Continue listening: `You have 18 minutes left in “Article title”. Pick up where you left off.`
- Document ready: `“Book title” is ready to listen.`
- Weekly recap: `You listened for 42 minutes this week. Your library is ready when you are.`

Titles should be short (`Continue listening`, `Ready to listen`, `Your week in Soundoc`) and bodies should be privacy-conscious. Do not include full source text, URLs, or sensitive excerpts.

### Notification interactions

Tap handling should open the related document in the existing Player screen with playback paused. The app must not autoplay from a notification. Weekly recap opens the home screen or Settings analytics area, whichever is available without introducing navigation dependencies.

When a notification arrives while Soundoc is active, the handler should suppress a redundant banner while the user is already in the relevant flow. The app can continue to show its existing inline status UI. When Soundoc is backgrounded, the notification should present passively without a sound or badge.

## Data model

Create a focused notification preferences type rather than extending `SpeechPreferences`:

```ts
type NotificationCadence = 'daily' | 'weekdays';
type NotificationWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type NotificationPreferences = {
  enabled: boolean;
  continueListeningEnabled: boolean;
  continueListeningTime: { hour: number; minute: number };
  continueListeningCadence: NotificationCadence;
  documentReadyEnabled: boolean;
  weeklyRecapEnabled: boolean;
  weeklyRecapWeekday: NotificationWeekday;
  weeklyRecapTime: { hour: number; minute: number };
};
```

Defaults are intentionally conservative:

- `enabled: false`
- `continueListeningEnabled: true`
- `continueListeningTime: 20:00`
- `continueListeningCadence: 'daily'`
- `documentReadyEnabled: true`
- `weeklyRecapEnabled: false`
- `weeklyRecapWeekday: 1` (Sunday)
- `weeklyRecapTime: 18:00`

Stored settings must be versioned and normalized on read so malformed or older values safely fall back to these defaults.

## Architecture

### Notification service

Create `src/lib/notifications.ts` as the single owner of notification behavior. It should provide:

- defaults and storage key
- normalization and serialization helpers
- permission status lookup and permission request
- Android channel setup
- scheduling and cancellation for each category
- a single `syncScheduledNotifications(preferences, items, analytics, permission?)` operation that is idempotent
- notification content builders
- notification response payload parsing

The service must not import React components or mutate application state. It may use AsyncStorage and `expo-notifications`.

Use stable notification identifiers/data markers so Soundoc can cancel only its own scheduled notifications. Do not call the global cancel-all API because that could remove notifications belonging to another version or future subsystem.

### App integration

In `App.tsx`:

- Load and normalize notification preferences alongside the existing onboarding/settings storage.
- Configure the notification handler once at module scope or through the service before the app renders.
- Keep notification preferences in app state and persist them with a dedicated storage key.
- Sync on startup, when the app becomes active, when notification preferences change, when library items change, and after large-document processing completes.
- Register a notification response listener and route supported item IDs through the existing `openItem` path with autoplay disabled.
- When permission is denied, keep the in-app setting off and expose the open-settings action.

The sync operation should schedule at most one Continue Listening notification per configured day and at most one Weekly Recap notification. It should cancel stale Soundoc notifications before adding current ones. It should schedule Document Ready only from a real local transition to `ready`, and should not generate a notification for a document the user already opened after preparation.

### Settings integration

Create `src/components/NotificationSettingsSection.tsx` to keep notification presentation and interaction logic out of the already large Settings screen. The component receives preferences, permission state, and callbacks for update, permission request, and open-system-settings. It should use existing `SoundocToggle`, `SkeuoSwitch`, `Section`, and modal surface patterns where practical.

Extend `SettingsScreen` props to receive notification state and callbacks, render the new section, and keep Settings responsible only for layout/state ownership rather than scheduling details.

## Permission and platform behavior

- Request permission only after the user enables the master switch.
- Request alerts and sound permission, but schedule Soundoc notifications with `sound: false` and no badge by default so the result remains quiet.
- Treat iOS provisional authorization as usable for scheduling, but show the current permission state without claiming full alert authorization.
- On Android, create a low-importance `soundoc-reading` channel with an informative name before requesting notification permission or scheduling.
- Use `SchedulableTriggerInputTypes.DAILY` for daily reminders and `WEEKLY` for weekday/weekly recap schedules. For weekday cadence, schedule five weekly requests, one for Monday through Friday.
- Do not add `remote-notification` to iOS background modes. This feature is local-only.
- Document that a native rebuild is required after adding `expo-notifications` and its config plugin.

## Edge cases

- If there are no unfinished items, cancel Continue Listening reminders.
- If the selected item becomes completed, resync and cancel or replace the reminder.
- If a notification references a deleted item, ignore the tap and open the library/home screen.
- If a long document fails or is paused, do not send Document Ready.
- If a scheduled notification cannot be created, keep preferences saved, avoid crashing, and show a small in-app status message on the next Settings visit if practical.
- If the system permission is later revoked, reflect that state when Settings becomes active and stop scheduling until re-enabled.
- Keep notification title/body lengths bounded and sanitize curly quotes/title whitespace.

## Testing and verification

Add focused unit tests before implementation for:

- default preferences and normalization
- notification copy and privacy limits
- reminder eligibility from library items
- daily, weekday, and weekly trigger generation
- stale notification cancellation/scheduling plans
- document-ready transition eligibility
- response payload parsing

Run the repository's existing tests plus the new focused tests. Run TypeScript validation using the available compiler command. Verify `app.json` includes the SDK 57 notifications plugin and `package.json` uses the SDK 57-compatible `expo-notifications` version. Manual verification should cover permission denied, permission granted, disabled settings, item tap routing, and native rebuild behavior on a development build or simulator.

