# Share to Soundoc / Quick Read Design

## Summary

Soundoc will add a production iOS Share Extension that accepts public HTTP/HTTPS webpage links, saves a small durable record in an App Group inbox, and lets the main app process those links through the same guarded URL and article-extraction pipeline used by manual Web Link imports.

When Soundoc next launches or becomes active, it will process pending links sequentially, save normal Library items, load the first successful item into the existing Player, and autoplay by default through the existing playback path. Additional successful links from the same inbox batch will be appended to the existing listening queue instead of replacing the active Player.

The feature also adds a fourth Home import option, an in-app explanation sheet, an Auto-play shared links preference, and one onboarding slide. Existing users will not be forced through onboarding again.

## Goals

- Make Safari, Chrome, and other apps able to share ordinary webpage URLs to Soundoc with minimal interaction.
- Keep the Share Extension fast, native, branded, accessible, and App Store compliant.
- Reuse Soundoc's existing URL validation, redirect handling, article extraction, Library persistence, Player, speech preferences, queue, subscriptions, and playback limits.
- Survive app termination, extension dismissal, offline launches, duplicate shares, and multiple pending URLs.
- Preserve both the existing local Xcode/archive workflow and Expo/EAS clean builds.
- Keep Auto-play shared links enabled by default while making it easy to understand and disable.

## Non-goals

- No TTS, network article extraction, or full-page storage inside the Share Extension.
- No private API or responder-chain workaround to launch the containing app.
- No new Player, audio engine, Library model, navigation framework, settings store, analytics SDK, or article parser.
- No support for arbitrary images, local files, selected article bodies, authenticated pages, or paywall circumvention in the first release.
- No unrelated Home, Settings, onboarding, RevenueCat, or Player redesign.

## Existing architecture and constraints

The project uses Expo SDK 57.0.13, React Native 0.86.2, React 19.2.3, Hermes, and the React Native New Architecture. The app has a manually available native iOS project with one `Soundoc` target, but `/ios` is ignored by Git and clean EAS builds rely on Expo configuration. The app's bundle identifier is `com.lecoffeeconfit.soundoc`, its Apple development team is `LD4FX75VKF`, and its deployment target is iOS 16.4. Existing entitlements include iCloud containers; existing Info.plist settings include background audio and the `soundoc` URL scheme.

Manual Web Link import currently lives in `App.tsx`: it validates public URLs, follows guarded redirects, detects direct document responses, downloads supported documents through the large-document path, fetches HTML, calls `extractArticleFromHtml`, shows an article preview, then saves through the ordinary or chunked Library path. Library data is stored in SQLite. Playback is entered through `player.load(item, autoplay)`, which already applies current voices, modes, speeds, pitch, pause rules, RevenueCat/free-listening access, and the established speech engine.

The UI uses a fixed graphite/orange Soundoc theme with rounded raised and inset cards, system fonts, dark surfaces, lightweight animation, VoiceOver labels, and a once-only onboarding completion key at `soundoc.onboarding.complete`.

## Identifiers and capabilities

- Main app bundle identifier: `com.lecoffeeconfit.soundoc` (unchanged)
- Share Extension bundle identifier: `com.lecoffeeconfit.soundoc.ShareExtension`
- App Group identifier: `group.com.lecoffeeconfit.soundoc`
- Share Extension product name: `SoundocShareExtension`
- Share Extension display name: `Soundoc`
- Deployment target: iOS 16.4, matching the main target

The App Group entitlement will be added to both targets without removing existing main-app entitlements. The extension will use automatic signing with the existing development team and a bundle identifier derived from the main app. Its version and build number will inherit the containing app's values.

The activation rule will be a narrow dictionary, not `TRUEPREDICATE`. It will support at most one web URL and plain text. Runtime validation will accept only an `http` or `https` URL with no credentials and reject file URLs, custom schemes, localhost, obvious private/local literal addresses, malformed values, and plain text with no valid web URL.

## Native source of truth and build strategy

The feature will use a first-party hybrid structure:

1. A local Expo Module in `modules/soundoc-shared-inbox` will implement the New-Architecture-compatible native interface using Expo Modules API and Swift.
2. Tracked Share Extension templates and a first-party Expo config plugin will live outside the ignored `/ios` directory.
3. The config plugin will copy the native extension sources into a generated iOS project, add and embed the extension target, configure build settings, add the App Group entitlements, and preserve all existing capabilities.
4. The current local Xcode project will receive the equivalent minimal target and entitlement changes directly, without running `expo prebuild --clean`.
5. Clean-generation behavior will be tested in a temporary project copy so the user's local native project is not regenerated destructively.

This keeps tracked Expo configuration as the reproducible source of truth while allowing the current local workspace to build and archive immediately.

## Shared inbox

The App Group container will hold a small versioned JSON inbox file. It will never contain HTML, article text, cookies, credentials, or downloaded files.

Each item will contain:

- `id`: UUID
- `url`: original validated URL
- `canonicalUrl`: conservative comparison form
- `createdAt`: ISO-8601 timestamp
- `sourceType`: `url` or `plainText`
- `title`: optional source-provided title
- `status`: `pending`, `processing`, `retryable`, `processed`, or `failed`
- `autoplay`: share-time snapshot of the preference
- `attemptCount`: nonnegative integer
- `nextAttemptAt`: optional ISO-8601 retry time
- `lastErrorCode`: optional privacy-safe category, never the full page contents

Cross-process reads and writes will use a serial access path, `NSFileCoordinator`, and atomic file replacement. Malformed or unsupported inbox versions will fail safely without crashing either process. The store will cap retained records and prune old processed records so the file stays small.

Pending items with the same canonical URL will be collapsed. Re-sharing a currently pending URL will report success without creating another queue entry.

## URL canonicalization and validation

Native and TypeScript helpers will implement matching conservative rules:

- Lowercase scheme and host.
- Remove the fragment.
- Remove default ports.
- Preserve path and meaningful query parameters.
- Remove known tracking-only parameters such as `utm_*`, `fbclid`, `gclid`, `mc_cid`, and `mc_eid` from the comparison value only.
- Never replace the original URL used for fetching with the canonical comparison value.

Library duplicate checks will compare canonical versions of both the initially shared URL and the final resolved URL. This avoids duplicates caused by fragments, tracking parameters, or redirects while avoiding broad heuristics that could merge genuinely different articles.

## Share Extension behavior

The custom Swift extension view controller will:

1. Show a compact Soundoc loading state immediately.
2. Inspect all `NSExtensionItem` attachments for `UTType.url` first, then `UTType.plainText`.
3. Extract the first valid HTTP/HTTPS URL. Plain text will be examined only for a valid web URL.
4. Read an optional title from the extension item when available.
5. Read the mirrored autoplay preference, defaulting to `true` when no value exists.
6. Queue the item through the shared store.
7. Show success, duplicate-success, or clear error copy.
8. Complete the extension request only when the user taps Done or the host dismisses it.

The success state will use the Soundoc mark, graphite surfaces, orange accent, the page title or domain, and the copy “Ready for Soundoc,” “Saved to your Library,” and “Open Soundoc when you're ready to listen.” The wording describes the durable handoff; the main app remains responsible for actual article creation.

The extension will use Dynamic Type, VoiceOver labels, readable contrast, and at least 44-point controls. It will not perform distracting animation, network requests, TTS, or containing-app launch attempts.

## Expo Module interface

The local iOS-only Expo Module will expose a narrow asynchronous API conceptually equivalent to:

- `getPendingSharedItems()`
- `markSharedItemProcessing(id)`
- `markSharedItemRetryable(id, errorCode, nextAttemptAt)`
- `acknowledgeSharedItem(id)`
- `markSharedItemFailed(id, errorCode)`
- `clearProcessedSharedItems()`
- `setAutoPlaySharedLinks(enabled)`

On unsupported platforms or Expo Go, the TypeScript wrapper will return an empty inbox and persist the app preference normally without crashing. No legacy React Native bridge implementation will be introduced.

## Shared and manual URL pipeline

The network and extraction work currently inside `prepareLink` will be factored into a focused reusable resolver. The resolver will preserve current behavior:

- `safePublicUrl` validation
- direct-document routing by path and response headers
- bounded manual redirect handling with guarded redirect URLs
- supported document metadata and download routing
- HTML content-type checks
- response-size limits
- `extractArticleFromHtml`
- minimum readable-word checks
- privacy-safe categorized errors

The resolver will return a discriminated result representing either an article extraction or a supported direct document. Manual Web Link import will continue to show its existing preview and error UI. Shared-link processing will use the same result but treat the share action as confirmation, saving directly through the existing Library paths.

Article extraction will not be duplicated. The current deterministic extractor will be hardened behind the same resolver so every improvement applies equally to manual Web Link imports and Share to Soundoc.

## Main-content extraction and playback start

Soundoc will keep article extraction local and deterministic, with no paid API or remote parsing service. The existing JSON-LD, semantic-container, and paragraph fallback paths will be preserved, but candidate selection will no longer depend on the first regular-expression match alone.

The hardened extractor will:

- parse enough document structure to preserve nested article containers without truncating at an inner closing tag;
- prefer valid `Article`, `NewsArticle`, and `ScholarlyArticle` JSON-LD bodies when they contain substantial readable text;
- collect multiple `article`, `main`, and recognized content-container candidates rather than only the first match;
- score candidates using paragraph text density, punctuation, heading continuity, useful-text length, link density, boilerplate class/role penalties, and repeated-control penalties;
- remove scripts, styles, navigation, cookie/consent surfaces, ads, sharing controls, related-story modules, newsletter/sign-in prompts, repetitive site headers and footers, image-credit-only rows, and reference-list tails;
- preserve useful headings, ordered content, Unicode, quotations, and article paragraphs;
- collapse repeated title, dek, byline, update-time, and paragraph text conservatively;
- retain the original fetched URL and final resolved URL metadata while using canonical URLs only for duplicate comparison;
- emit a confidence score and privacy-safe warning codes when the page is unusually short, script-only, ambiguous, or contains too much control text.

For ordinary articles, the first two primary speakable blocks will be the detected headline and the first meaningful article paragraph. A confidently identified byline remains available as item metadata rather than interrupting that start. For academic articles, the abstract is meaningful article content and may follow the title before the body. Site navigation, breadcrumbs, dates repeated from page chrome, sharing prompts, and other controls must never precede the main content. This same ordered text becomes the existing Player's initial chunks, so both manual and shared imports start consistently without a separate playback-offset hack.

Extraction will have bounded work limits for input size, element count, candidate count, and output size. If no candidate clears the readable-content threshold, a shared URL will remain available for its bounded retry/manual-fallback state rather than saving page chrome as an article; a manual Web Link import will keep its existing error/preview behavior.

## Main-app processing lifecycle

A focused shared-link processor will be activated only after database and preferences initialization. It will run on initial app readiness and whenever `AppState` becomes active.

The processor will use a mutex/ref guard and item status transitions to prevent overlapping runs or duplicate work. It will process eligible items oldest-first and will not launch multiple Player screens.

For each item:

1. Mark it processing.
2. Check the in-memory/SQLite Library for the original canonical URL.
3. If found, acknowledge the inbox record and treat the existing item as the result.
4. Otherwise call the shared URL resolver.
5. Before saving, compare the final resolved canonical URL with Library items again.
6. Save through the existing normal article, chunked article, or direct-document path.
7. Acknowledge only after durable Library persistence succeeds.
8. Classify failures as retryable or terminal.

The first successful item in a processing batch becomes Now Reading. The app calls the existing `player.load(item, autoplay)` path and navigates to Player once. Additional successful items are saved normally and appended in order to the existing listening queue. They do not replace the active Player.

If the existing Library item is already loaded or playing, a duplicate share will not reset its progress. If another item is actively playing when a new batch arrives, processing will save/queue new items without interrupting current audio; automatic loading occurs only when it will not unexpectedly replace active playback.

## Auto-play shared links preference

The preference key will use the existing AsyncStorage settings approach and default to `true` for new and existing users that do not have a stored value.

Changing the setting from Home or Settings will:

- Update the single React state value.
- Persist the value in AsyncStorage.
- Mirror the value through the Expo Module into App Group preferences for future share-time snapshots.

The setting affects only Share to Soundoc items. Manual imports and ordinary Library opens retain their current behavior. Autoplay always calls the existing Player load/play route and therefore preserves RevenueCat and free-listening enforcement.

## Home experience

The approved Home screen already presents Web Article or Link, Share to Soundoc, PDF & Documents, and Paste Text as a compact four-card vertical stack. That layout, card order, borders, typography, spacing, Continue Listening placement, camera/photo actions, and existing handlers will remain unchanged. The native work will only connect the existing Share to Soundoc instructional card to the real capability and add the controlled Auto-play setting to its existing page sheet.

Tapping Share to Soundoc opens a compact page sheet with:

- “Listen to any webpage”
- Safari/Chrome/other-app steps: Share → Soundoc
- A brief explanation that Soundoc cleans and saves the page
- The Auto-play shared links switch
- “Start reading as soon as Soundoc prepares the page.”
- A tip about adding Soundoc to Share Sheet favorites

The sheet will reuse the app's current modal, card, toggle, spacing, and accessibility patterns and remain visually light.

## Settings and onboarding

Settings will gain a small Quick Read section containing the same Auto-play shared links switch and supporting copy. It will not create a second settings system.

Onboarding will gain one slide immediately after the existing import slide:

- Kicker: `02 · QUICK READ` with subsequent numbering adjusted
- Title: “Share it. Hear it.”
- Visual: webpage card → Share symbol → Soundoc mark → waveform
- Primary copy: “Find something worth reading? Share it to Soundoc and listen instead.”
- Short instructions for Share → Soundoc
- A small “Auto-play is on” callout that points to Home or Settings

The slide will reuse the current onboarding frame, motion, tip cards, dots, navigation, and typography. The existing `soundoc.onboarding.complete` storage key and semantics will not change, so established users will not see onboarding again after upgrading. They can reopen the updated guide from Settings.

## App-side status and errors

The app will present at most one shared-import status surface at a time. While processing, it will show concise “Preparing article…” feedback without blocking unrelated app initialization.

Failure categories:

- Invalid/unsupported content in the extension: “Soundoc couldn't read this link.” Nothing is queued.
- Offline or transient network failure: “Saved for later. Soundoc will prepare this page when you're back online.” The item remains retryable.
- Extraction failure: “We saved the link, but couldn't extract the article. You can try importing it manually.” The user can open the existing Web Link importer with the URL prefilled.
- Duplicate Library item: no new item; the existing item is loaded or queued without resetting progress.
- Corrupt inbox record: skip safely, record only a privacy-safe error category, and never crash.

Retries will use bounded attempt counts and `nextAttemptAt` values to prevent tight foreground loops. Retryable items are checked on later activations; terminal failures remain available long enough to offer manual import before cleanup.

## Library and Player integration

Successfully imported shared webpages will be ordinary `article` Library items with `sourceType: 'url'`, using the existing title, source domain, resolved source URL, cleaned text, sections, word count, duration, extraction metadata, timestamps, voice settings, progress, and completion fields.

No second shared-article table or card design will be added. A source label may be represented in metadata if it fits existing fields, but Library cards will not gain visual clutter.

Shared articles will use the existing Player, speech text cleanup, selected voice, listening mode, speed, pitch, pauses, scrubber, controls, persistence, queue progression, and background behavior. Autoplay calls the same path as an existing Play action; it does not duplicate speech-engine logic.

## Accessibility, driving use case, privacy, and analytics

The external flow is intentionally one action after opening the Share Sheet: choose Soundoc and wait for confirmation. The UI will not encourage further phone interaction while driving.

All new controls and states will support VoiceOver, Dynamic Type, clear state labels, sufficient contrast, large hit targets, and reduced motion. No distracting animation will be added.

No new third-party analytics SDK will be added. The existing app has listening totals rather than a general event pipeline, so share telemetry will be omitted unless an appropriate first-party event facility emerges during implementation. Full URLs and article contents will never be logged.

The current privacy posture remains local-first: URLs are shared into the App Group and later fetched directly by Soundoc, while article text remains in the existing local Library. Documentation and public privacy wording should mention that shared URLs are temporarily stored in the shared app container and fetched when Soundoc becomes active; unrelated legal copy will not be edited.

## Regression safeguards

- Preserve the main bundle identifier, team, deployment target, iCloud entitlements, background audio, RevenueCat integration, privacy strings, versions, Pods, workspace, and current build settings.
- Do not run destructive prebuild or regenerate the current native project.
- Keep the manual Web Link preview behavior unchanged.
- Keep Paste Text, File import, OCR, Library, queue, subscriptions, onboarding completion, and Player APIs unchanged.
- Build shared functionality behind focused modules and pure helpers rather than adding more unrelated responsibility to `App.tsx`.
- Preserve the user's existing uncommitted edits in `App.tsx`, `app.json`, and `SourceReaderScreen.tsx`.

## Testing strategy

### Pure and TypeScript tests

- Native/TypeScript canonicalization parity fixtures
- HTTP/HTTPS validation and plain-text URL extraction cases
- Duplicate pending shares and duplicate Library URLs
- FIFO ordering and additional-item listening queue behavior
- Status transitions, acknowledgment, retry classification, retry bounds, and crash recovery
- Auto-play default, persistence, mirrored value, and Off behavior
- Shared/manual URL resolver parity with mocked fetch/redirect/document/article responses
- Existing article extraction fixtures plus nested content containers, multiple competing article cards, leading navigation/breadcrumbs, cookie and subscription overlays, repeated dek/byline text, related-story tails, image credits, unusual Unicode, academic abstracts/references, very long content, and script-only pages
- Playback-start fixtures asserting that the first speakable chunks are the headline and first meaningful paragraph, never page chrome
- Extraction work-limit fixtures for oversized HTML, excessive elements/candidates, and low-confidence non-article pages
- Existing project fixtures and `npx tsc --noEmit`

### Native and build tests

- Validate the config plugin against a temporary clean iOS generation
- Verify both main app and Share Extension entitlements and bundle identifiers
- Build the app and embedded extension with signing disabled using a writable DerivedData directory
- Attempt a clean archive with available signing and report any provisioning-only blocker
- Confirm the extension is embedded in the app bundle and uses an extension-safe API set

### Simulator and UI tests

- Home 2 × 2 and large-Dynamic-Type one-column layouts
- Explanation sheet and shared preference synchronization
- Settings Quick Read section
- Updated onboarding without changing completion semantics
- Extension loading, success, duplicate, and error states
- Foreground processing, Player navigation, Auto-play On and Off
- Manual Web Link, Paste Text, File import, Library, Player, and subscription smoke tests

### Physical-device checks

The final report will explicitly separate checks that require an Apple-provisioned physical device:

- Safari, Chrome, Firefox, Apple News, and Reddit Share Sheet appearance
- Share while Soundoc is terminated or backgrounded
- Several shares over time
- Offline recovery on a real network transition
- Production signing, App Group provisioning, and archive validation
- VoiceOver and actual system Share Sheet favorites behavior

## Dependencies and manual configuration

No new npm package, Pod, paid API, or analytics SDK is planned. The implementation will use Expo Modules Core already supplied by Expo, Foundation/UIKit/UniformTypeIdentifiers, the existing project dependencies, and a first-party config plugin.

Apple Developer/App Store Connect may require the following manual portal actions if automatic signing cannot create them:

1. Register `group.com.lecoffeeconfit.soundoc`.
2. Enable that App Group for both `com.lecoffeeconfit.soundoc` and `com.lecoffeeconfit.soundoc.ShareExtension`.
3. Register the extension App ID.
4. Refresh development and distribution provisioning profiles.

All code-side capability settings will be included. The final handoff will report the exact remaining portal or signing steps based on the build results.

## Acceptance criteria

- Soundoc appears for supported HTTP/HTTPS shares with a narrow production activation rule.
- Selecting Soundoc validates and durably queues the URL without networking, audio, or forced app launch.
- Soundoc processes pending links on launch/foreground through the same URL resolver and extraction logic used by manual imports.
- Shared and manual articles use the same hardened main-content extraction, begin with the headline and first meaningful paragraph, and never start playback with navigation or control text.
- Successful pages become normal Library items and use the existing Player.
- Auto-play shared links defaults On, can be changed from Home and Settings, and affects only shared links.
- Duplicate shares do not create duplicate Library items or reset existing progress.
- Multiple items are processed sequentially; the first becomes Now Reading and later items join the existing listening queue without Player-screen churn.
- Offline/transient failures remain retryable and malformed inputs never crash.
- Home, onboarding, Settings, extension states, and accessibility feel consistent with Soundoc's existing visual language.
- Existing imports, Library, Player, subscription/paywall behavior, and established-user onboarding state continue to work.
- Both clean Expo/EAS generation and the existing local Xcode project contain a compilable embedded Share Extension.
