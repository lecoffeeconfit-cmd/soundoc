# Share to Soundoc / Quick Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production-quality iOS Share Extension that durably hands public webpage links to Soundoc, imports them through the existing guarded article pipeline, and exposes an intuitive fourth Home option, onboarding step, and Settings preference.

**Architecture:** A first-party Expo config plugin creates and embeds a native iOS Share Extension while a local Expo Module gives the React Native app access to a coordinated App Group inbox. Pure TypeScript modules own canonicalization, URL resolving, preference behavior, and inbox processing; `App.tsx` only wires those modules into existing Library, queue, and Player APIs. The Home explanation sheet, Settings section, and onboarding slide share one Auto-play state that defaults to On and is mirrored into the App Group.

**Tech Stack:** Expo SDK 57.0.13, React Native 0.86.2 New Architecture, React 19.2.3, TypeScript 6.0.3, Expo Modules API, Swift/UIKit/Foundation/UniformTypeIdentifiers, Xcode 26.6, SQLite, AsyncStorage, first-party Expo config plugin.

**Spec:** `docs/superpowers/specs/2026-08-23-share-to-soundoc-design.md`

## Global Constraints

- Read and follow the exact Expo SDK 57 documentation at `https://docs.expo.dev/versions/v57.0.0/` before changing Expo configuration or native integration.
- Preserve main bundle identifier `com.lecoffeeconfit.soundoc`, Apple team `LD4FX75VKF`, deployment target iOS 16.4, build number, iCloud entitlements, background audio, RevenueCat, Hermes, and New Architecture.
- Use extension bundle identifier `com.lecoffeeconfit.soundoc.ShareExtension`, product name `SoundocShareExtension`, display name `Soundoc`, and App Group `group.com.lecoffeeconfit.soundoc`.
- Auto-play shared links defaults to `true` when no stored value exists, including for existing users upgrading from a build without the preference.
- The Share Extension performs no network request, article extraction, TTS, audio playback, or containing-app launch workaround.
- Shared records contain URLs and privacy-safe status only; never persist HTML, article text, cookies, credentials, or response bodies in the App Group.
- Keep the onboarding completion key exactly `soundoc.onboarding.complete` so existing users are not shown onboarding again automatically.
- Preserve manual Web Link preview behavior and the existing Paste Text, file, OCR, Library, queue, Player, and subscription behavior.
- Do not run `expo prebuild --clean` against the working checkout and do not overwrite existing user changes in `App.tsx`, `app.json`, `src/components/SourceReaderScreen.tsx`, or `src/lib/popupHeaderLayout.test.ts`.
- Add no third-party runtime, npm, Pod, paid API, or analytics dependency.
- Use `apply_patch` for tracked and local native edits. Stage only files owned by the current task at each commit; use `git add -p App.tsx` and `git add -p app.json` so the user's pre-existing hunks are never included.

## File Structure

### New tracked files

- `fixtures/shared-url-canonicalization.json` — one cross-language table of valid, rejected, and canonical URL cases used by TypeScript and Swift tests.
- `src/lib/sharedLinks.ts` — pure URL validation, canonicalization, inbox types, retry policy, and Library duplicate matching.
- `src/lib/sharedLinks.test.ts` — executable fixtures for canonicalization, validation, deduplication, status recovery, and retry bounds.
- `src/lib/urlResolver.ts` — reusable guarded URL/document/article resolver extracted from `App.tsx`.
- `src/lib/urlResolver.test.ts` — mocked-fetch parity fixtures for manual and shared callers.
- `src/lib/quickReadPreferences.ts` — AsyncStorage key/default parsing plus App Group mirroring.
- `src/lib/quickReadPreferences.test.ts` — default-On, persistence, and mirror fixtures.
- `src/lib/quickReadLayout.ts` — pure Home import-column decision for width and Dynamic Type.
- `src/lib/quickReadLayout.test.ts` — ordinary-phone and accessibility-size layout fixtures.
- `src/lib/quickReadStatus.ts` — pure processing-state-to-copy mapping.
- `src/lib/quickReadStatus.test.ts` — preparing, retryable, manual-fallback, and success copy fixtures.
- `src/lib/quickReadCopy.ts` — shared Home/Settings/extension-facing product copy constants.
- `src/lib/quickReadCopy.test.ts` — required instruction and preference-copy fixtures.
- `src/lib/onboardingGuide.ts` — pure seven-slide onboarding content model.
- `src/lib/onboardingGuide.test.ts` — Quick Read placement, numbering, copy, and count fixtures.
- `src/lib/sharedLinkProcessor.ts` — dependency-injected FIFO processor for inbox-to-Library/queue/Player decisions.
- `src/lib/sharedLinkProcessor.test.ts` — processor fixtures for duplicates, retries, acknowledgements, active playback, and multiple items.
- `src/lib/readingSourcePersistence.ts` — one article/document persistence path shared by manual and Quick Read callers.
- `src/lib/readingSourcePersistence.test.ts` — callback-driven article/document persistence parity fixtures.
- `scripts/run-quick-read-fixtures.ts` — invokes all new pure TypeScript fixture suites and exits nonzero on failure.
- `tsconfig.quick-read-tests.json` — emits only pure test modules to a temporary output directory for execution with Node.
- `modules/soundoc-shared-inbox/expo-module.config.json` — local Expo Module registration.
- `modules/soundoc-shared-inbox/package.json` — private local-module metadata.
- `modules/soundoc-shared-inbox/index.ts` — public TypeScript wrapper with iOS native and unsupported-platform fallbacks.
- `modules/soundoc-shared-inbox/src/SoundocSharedInbox.types.ts` — native API and shared-item TypeScript contracts.
- `modules/soundoc-shared-inbox/ios/SoundocSharedInboxModule.swift` — Expo Modules API bridge.
- `modules/soundoc-shared-inbox/ios/SharedInboxStore.swift` — Foundation-only coordinated JSON store used by the module and copied into the extension target.
- `modules/soundoc-shared-inbox/Package.swift` — SwiftPM test package that compiles only the Foundation store.
- `modules/soundoc-shared-inbox/Tests/SharedInboxStoreTests.swift` — canonicalization and state-store XCTest coverage.
- `share-extension/ios/ShareViewController.swift` — custom accessible extension UI and attachment loading.
- `share-extension/ios/Info.plist` — narrow activation rule and extension metadata.
- `share-extension/ios/SoundocShareExtension.entitlements` — App Group entitlement.
- `share-extension/ios/Assets.xcassets/Contents.json` — extension asset catalog metadata.
- `share-extension/ios/Assets.xcassets/SoundocMark.imageset/Contents.json` — Soundoc mark image metadata.
- `plugins/withSoundocShareExtension.js` — Expo config plugin that adds App Group entitlements, copies templates, creates the target, and embeds the `.appex`.
- `plugins/shareExtensionProject.js` — deterministic pbxproj helper functions kept separately for direct Node fixture tests.
- `plugins/shareExtensionProject.test.js` — idempotence and build-setting fixtures.
- `scripts/verify-share-extension.js` — validates generated entitlements, plist activation rule, build settings, embedding, and extension-safe source rules.
- `scripts/verify-clean-share-generation.sh` — creates an isolated `mktemp` copy, runs Expo prebuild there, verifies the generated target, and optionally builds it.
- `src/components/QuickReadSheet.tsx` — Home explanation/configuration page sheet.
- `src/components/QuickReadSettingRow.tsx` — shared presentation for the Auto-play setting used by Home and Settings.
- `src/components/QuickReadComponents.test.tsx` — compile-time controlled-prop contracts for the sheet and row.
- `src/screens/SettingsScreen.quickRead.test.tsx` — compile-time Quick Read Settings prop contract.

### Existing tracked files to modify

- `App.tsx` — initialize Quick Read preference, run the processor after readiness/on foreground, pass shared state to UI, use the extracted resolver for manual links, and render the sheet/status surface.
- `app.json` — register `./plugins/withSoundocShareExtension` without disturbing existing plugins or build metadata.
- `package.json` — add local module dependency and verification scripts only; do not add an external package.
- `package-lock.json` — record the local `file:modules/soundoc-shared-inbox` dependency.
- `src/screens/SettingsScreen.tsx` — add the Quick Read section and controlled Auto-play switch.
- `src/components/OnboardingModal.tsx` — add the Quick Read slide immediately after import and renumber later slides.
- `src/lib/database.ts` — add a canonical URL lookup helper without changing the Library schema.
- `src/lib/text.ts` — export or reuse only the public-URL guards needed by canonicalization/resolving.
- `docs/OCR_AND_SHARE_LIMITATIONS.md` — replace the pending-extension limitation with the implemented flow and physical-device constraints.
- `share-extension/README.md` — document the final architecture, identifiers, build verification, and Apple portal steps.

### Existing ignored local native files to modify for immediate local builds

- `ios/Soundoc/Soundoc.entitlements` — append App Group entitlement while preserving all iCloud keys.
- `ios/Soundoc.xcodeproj/project.pbxproj` — add, configure, embed, and sign the extension target with iOS 16.4.
- `ios/SoundocShareExtension/*` — generated copy of the tracked extension sources and `SharedInboxStore.swift`.

---

### Task 1: Pure shared-link contract and canonicalization

**Files:**
- Create: `fixtures/shared-url-canonicalization.json`
- Create: `src/lib/sharedLinks.ts`
- Create: `src/lib/sharedLinks.test.ts`
- Create: `scripts/run-quick-read-fixtures.ts`
- Create: `tsconfig.quick-read-tests.json`
- Modify: `src/lib/database.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `SharedInboxItem`, `SharedInboxStatus`, `canonicalizeSharedUrl(value: string): string | undefined`, `extractShareablePublicUrl(value: unknown): URL | undefined`, `findLibraryItemBySharedUrl(items: readonly LibraryItem[], candidates: readonly string[]): LibraryItem | undefined`, `classifySharedLinkFailure(error: unknown, attemptCount: number, now?: number): SharedFailureDecision`, and `recoverInterruptedSharedItems(items, now)`.
- Consumes: existing `safePublicUrl` semantics and `LibraryItem.sourceUrl`.

- [ ] **Step 1: Write the failing pure fixtures**

```ts
import {
  canonicalizeSharedUrl,
  classifySharedLinkFailure,
  extractShareablePublicUrl,
  findLibraryItemBySharedUrl,
  recoverInterruptedSharedItems,
} from './sharedLinks';

export function runSharedLinkFixtures() {
  const canonical = canonicalizeSharedUrl('HTTPS://Example.COM:443/story?utm_source=x&id=7#comments');
  if (canonical !== 'https://example.com/story?id=7') throw new Error(`canonical URL mismatch: ${canonical}`);
  if (extractShareablePublicUrl('file:///private/note') !== undefined) throw new Error('file URL accepted');
  if (extractShareablePublicUrl('Read https://example.com/story?id=7 today')?.hostname !== 'example.com') throw new Error('plain-text URL missing');
  const duplicate = findLibraryItemBySharedUrl([{ id: 'one', sourceUrl: 'https://example.com/story?id=7#top' } as never], ['https://example.com/story?utm_medium=social&id=7']);
  if (duplicate?.id !== 'one') throw new Error('Library canonical duplicate missing');
  const recovered = recoverInterruptedSharedItems([{ id: 'a', status: 'processing', attemptCount: 0, createdAt: '2026-08-23T00:00:00.000Z' } as never], Date.parse('2026-08-23T00:10:00.000Z'));
  if (recovered[0].status !== 'retryable') throw new Error('interrupted item was not recovered');
  const retry = classifySharedLinkFailure(new TypeError('Network request failed'), 1, 1_000);
  if (retry.kind !== 'retryable' || retry.nextAttemptAt !== 61_000) throw new Error('network retry policy mismatch');
}
```

Load the same cases from `fixtures/shared-url-canonicalization.json`; include mixed-case hosts, default ports, fragments, tracking keys, meaningful query keys, credential-bearing URLs, localhost, IPv4 private ranges, IPv6 loopback/link-local addresses, custom schemes, and prose containing one valid HTTPS link.

- [ ] **Step 2: Run the fixtures and confirm they fail because the module does not exist**

Run: `npx tsc -p tsconfig.quick-read-tests.json --outDir /private/tmp/soundoc-quick-read-tests`

Expected: FAIL with `Cannot find module './sharedLinks'`.

- [ ] **Step 3: Implement the typed contract and conservative comparison rules**

```ts
export type SharedInboxStatus = 'pending' | 'processing' | 'retryable' | 'processed' | 'failed';
export type SharedInboxItem = {
  id: string;
  url: string;
  canonicalUrl: string;
  createdAt: string;
  sourceType: 'url' | 'plainText';
  title?: string;
  status: SharedInboxStatus;
  autoplay: boolean;
  attemptCount: number;
  nextAttemptAt?: string;
  lastErrorCode?: string;
};

const trackingKeys = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid']);

export function canonicalizeSharedUrl(value: string) {
  const parsed = extractShareablePublicUrl(value);
  if (!parsed) return undefined;
  parsed.hash = '';
  if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) parsed.port = '';
  [...parsed.searchParams.keys()].forEach((key) => {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || trackingKeys.has(lower)) parsed.searchParams.delete(key);
  });
  parsed.searchParams.sort();
  return parsed.toString();
}
```

Implement `extractShareablePublicUrl` so string values may be a bare URL or prose containing one URL, and route every candidate through `safePublicUrl`. Use retry delays `[60_000, 5 * 60_000, 30 * 60_000]`; the fourth failure is terminal. Recover stale `processing` records as immediately eligible `retryable` records on the next app launch.

Add `findLibraryItemBySourceUrls(urls: readonly string[])` to `database.ts`; it calls `listItems()` and uses `findLibraryItemBySharedUrl` so no schema migration is needed.

Add scripts:

```json
{
  "test:quick-read": "npx tsc -p tsconfig.quick-read-tests.json --outDir /private/tmp/soundoc-quick-read-tests && node /private/tmp/soundoc-quick-read-tests/scripts/run-quick-read-fixtures.js",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 4: Run the pure fixtures and full typecheck**

Run: `npm run test:quick-read`

Expected: PASS with each suite name printed once and no URL contents printed.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the pure shared-link foundation**

```bash
git add fixtures/shared-url-canonicalization.json src/lib/sharedLinks.ts src/lib/sharedLinks.test.ts src/lib/database.ts scripts/run-quick-read-fixtures.ts tsconfig.quick-read-tests.json package.json
git commit -m "feat: add Quick Read link contract"
```

### Task 2: Local Expo Module and coordinated App Group inbox

**Files:**
- Create: `modules/soundoc-shared-inbox/package.json`
- Create: `modules/soundoc-shared-inbox/expo-module.config.json`
- Create: `modules/soundoc-shared-inbox/index.ts`
- Create: `modules/soundoc-shared-inbox/src/SoundocSharedInbox.types.ts`
- Create: `modules/soundoc-shared-inbox/ios/SharedInboxStore.swift`
- Create: `modules/soundoc-shared-inbox/ios/SoundocSharedInboxModule.swift`
- Create: `modules/soundoc-shared-inbox/Package.swift`
- Create: `modules/soundoc-shared-inbox/Tests/SharedInboxStoreTests.swift`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: async `getPendingSharedItems`, `markSharedItemProcessing`, `markSharedItemRetryable`, `acknowledgeSharedItem`, `markSharedItemFailed`, `clearProcessedSharedItems`, and `setAutoPlaySharedLinks` exports.
- Consumes: `SharedInboxItem` shape from Task 1 and App Group `group.com.lecoffeeconfit.soundoc`.

- [ ] **Step 1: Write Swift store tests before the store**

```swift
func testDuplicatePendingCanonicalURLIsCollapsed() throws {
  let store = try SharedInboxStore(containerURL: temporaryDirectory)
  let first = try store.enqueue(url: URL(string: "https://example.com/a?utm_source=x")!, title: nil, sourceType: .url, autoplay: true)
  let second = try store.enqueue(url: URL(string: "https://example.com/a")!, title: nil, sourceType: .url, autoplay: false)
  XCTAssertEqual(first.item.id, second.item.id)
  XCTAssertTrue(second.wasDuplicate)
}

func testProcessingTransitionIsDurable() throws {
  let result = try store.enqueue(url: URL(string: "https://example.com/a")!, title: nil, sourceType: .url, autoplay: true)
  try store.update(id: result.item.id, status: .processing)
  XCTAssertEqual(try store.pendingItems().first?.status, .processing)
}
```

Load `fixtures/shared-url-canonicalization.json` by resolving the repository root from `#filePath`, and assert every Swift validation/canonicalization result matches the TypeScript expected value. This is a parity test, not a second independently authored case list.

- [ ] **Step 2: Compile the isolated Swift package and confirm missing symbols**

Run: `swift test --package-path modules/soundoc-shared-inbox`

Expected: FAIL because `SharedInboxStore` is not implemented.

- [ ] **Step 3: Implement the Foundation-only store and Expo bridge**

```swift
let groupIdentifier = "group.com.lecoffeeconfit.soundoc"
let inboxFileName = "quick-read-inbox-v1.json"
let autoplayDefaultsKey = "soundoc.quickRead.autoplay"

struct SharedInboxFile: Codable {
  var version: Int = 1
  var items: [SharedInboxItem]
}
```

Add this Foundation-only SwiftPM manifest so tests do not require ExpoModulesCore:

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "SoundocSharedInboxStore",
  platforms: [.iOS(.v16)],
  products: [.library(name: "SoundocSharedInboxStore", targets: ["SoundocSharedInboxStore"])],
  targets: [
    .target(name: "SoundocSharedInboxStore", path: "ios", sources: ["SharedInboxStore.swift"]),
    .testTarget(name: "SharedInboxStoreTests", dependencies: ["SoundocSharedInboxStore"], path: "Tests"),
  ]
)
```

All mutations must run on a private serial queue, coordinate reads/writes with `NSFileCoordinator`, write encoded JSON to a sibling temporary file, and replace the inbox atomically. Limit the store to 100 records; prune processed records older than seven days and failed records older than thirty days. If JSON is malformed or has a version other than `1`, move it to a timestamped `.corrupt` filename and begin with an empty version-1 inbox.

Define the Expo module with async functions:

```swift
Name("SoundocSharedInbox")
AsyncFunction("getPendingSharedItems") { try store.pendingItems().map(\.dictionaryValue) }
AsyncFunction("markSharedItemProcessing") { (id: String) in try store.markProcessing(id: id) }
AsyncFunction("markSharedItemRetryable") { (id: String, errorCode: String, nextAttemptAt: String) in try store.markRetryable(id: id, errorCode: errorCode, nextAttemptAt: nextAttemptAt) }
AsyncFunction("acknowledgeSharedItem") { (id: String) in try store.markProcessed(id: id) }
AsyncFunction("markSharedItemFailed") { (id: String, errorCode: String) in try store.markFailed(id: id, errorCode: errorCode) }
AsyncFunction("clearProcessedSharedItems") { try store.clearProcessed() }
AsyncFunction("setAutoPlaySharedLinks") { (enabled: Bool) in store.setAutoplay(enabled) }
```

The TypeScript wrapper uses `requireOptionalNativeModule('SoundocSharedInbox')`. When unavailable, reads resolve to `[]`, mutations resolve without throwing, and no fake inbox is stored.

- [ ] **Step 4: Run Swift store tests and install the local module dependency**

Run: `swift test --package-path modules/soundoc-shared-inbox`

Expected: PASS.

Run: `npm install`

Expected: local `file:modules/soundoc-shared-inbox` dependency appears in `package-lock.json`; no remote package is added.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the local native inbox module**

```bash
git add modules/soundoc-shared-inbox package.json package-lock.json
git commit -m "feat: add shared Quick Read inbox module"
```

### Task 3: Accessible native Share Extension UI

**Files:**
- Create: `share-extension/ios/ShareViewController.swift`
- Create: `share-extension/ios/Info.plist`
- Create: `share-extension/ios/SoundocShareExtension.entitlements`
- Create: `share-extension/ios/Assets.xcassets/Contents.json`
- Create: `share-extension/ios/Assets.xcassets/SoundocMark.imageset/Contents.json`
- Create: `scripts/verify-share-extension.js`
- Modify: `share-extension/README.md`

**Interfaces:**
- Consumes: `SharedInboxStore.enqueue(url:title:sourceType:autoplay:)` from Task 2.
- Produces: a UIKit extension controller with loading, success, duplicate-success, and error states.

- [ ] **Step 1: Add a source-verification fixture that initially fails**

```js
const activation = info.NSExtension.NSExtensionAttributes.NSExtensionActivationRule;
assert.equal(activation.NSExtensionActivationSupportsWebURLWithMaxCount, 1);
assert.equal(activation.NSExtensionActivationSupportsText, true);
assert.doesNotMatch(swift, /openURL|UIApplication\.shared|fetch|URLSession|AVSpeech/);
```

- [ ] **Step 2: Run verification and confirm the extension template is missing**

Run: `node scripts/verify-share-extension.js --templates`

Expected: FAIL with `share-extension/ios/Info.plist not found`.

- [ ] **Step 3: Implement the extension template**

Use `UTType.url.identifier` first and `UTType.plainText.identifier` second. Load providers asynchronously, accept only the first value validated by `SharedInboxStore.validPublicURL`, read `NSExtensionItem.attributedTitle?.string`, mirror `autoplay` from shared `UserDefaults` with `true` fallback, and enqueue exactly once.

Use this explicit state model:

```swift
enum ViewState {
  case loading
  case success(title: String, duplicate: Bool)
  case failure(message: String)
}
```

The view hierarchy uses system Dynamic Type styles, `adjustsFontForContentSizeCategory = true`, graphite `#111417`/`#20252A`, accent `#FF955E`, a minimum 44-point Done button, `accessibilityViewIsModal = true`, and state announcements through `UIAccessibility.post(notification: .announcement, argument: message)`. Success copy is “Ready for Soundoc”, “Saved to your Library”, and “Open Soundoc when you're ready to listen.” Error copy is “Soundoc couldn't read this link.” The request completes only from Done or extension cancellation.

The plist activation dictionary is:

```xml
<key>NSExtensionActivationRule</key>
<dict>
  <key>NSExtensionActivationSupportsWebURLWithMaxCount</key><integer>1</integer>
  <key>NSExtensionActivationSupportsText</key><true/>
</dict>
```

- [ ] **Step 4: Verify template restrictions and compile the controller in the temporary test project**

Run: `node scripts/verify-share-extension.js --templates`

Expected: PASS with activation rule, App Group, privacy, and extension-safe API checks.

Run: `xcodebuild build -project /private/tmp/SoundocShareExtensionFixture/SoundocShareExtensionFixture.xcodeproj -scheme SoundocShareExtensionFixture -derivedDataPath /private/tmp/SoundocShareExtensionFixture/DerivedData CODE_SIGNING_ALLOWED=NO`

Expected: `BUILD SUCCEEDED`.

- [ ] **Step 5: Commit the native extension experience**

```bash
git add share-extension modules/soundoc-shared-inbox/ios/SharedInboxStore.swift scripts/verify-share-extension.js
git commit -m "feat: add Soundoc share extension UI"
```

### Task 4: Reproducible Expo config plugin and local Xcode target

**Files:**
- Create: `plugins/shareExtensionProject.js`
- Create: `plugins/shareExtensionProject.test.js`
- Create: `plugins/withSoundocShareExtension.js`
- Create: `scripts/verify-clean-share-generation.sh`
- Modify: `app.json`
- Modify locally: `ios/Soundoc/Soundoc.entitlements`
- Modify locally: `ios/Soundoc.xcodeproj/project.pbxproj`
- Create locally: `ios/SoundocShareExtension/*`

**Interfaces:**
- Produces: idempotent Expo config plugin `withSoundocShareExtension(config)`.
- Consumes: tracked extension templates, shared store Swift source, app icon, and identifier constants from the design.

- [ ] **Step 1: Write plugin idempotence fixtures**

```js
const once = applyShareExtensionProjectFixture(baseProject);
const twice = applyShareExtensionProjectFixture(once);
assert.deepEqual(twice, once);
assert.equal(countTargets(twice, 'SoundocShareExtension'), 1);
assert.equal(countEmbedEntries(twice, 'SoundocShareExtension.appex'), 1);
assert.equal(buildSetting(twice, 'PRODUCT_BUNDLE_IDENTIFIER'), 'com.lecoffeeconfit.soundoc.ShareExtension');
assert.equal(buildSetting(twice, 'IPHONEOS_DEPLOYMENT_TARGET'), '16.4');
```

- [ ] **Step 2: Run the plugin fixture and confirm missing helper failure**

Run: `node plugins/shareExtensionProject.test.js`

Expected: FAIL because `applyShareExtensionProjectFixture` does not exist.

- [ ] **Step 3: Implement config mods and apply equivalent local native edits**

The plugin must:

```js
const EXTENSION_NAME = 'SoundocShareExtension';
const EXTENSION_BUNDLE_ID = 'com.lecoffeeconfit.soundoc.ShareExtension';
const APP_GROUP = 'group.com.lecoffeeconfit.soundoc';
const DEPLOYMENT_TARGET = '16.4';
```

- use `withEntitlementsPlist` to merge `com.apple.security.application-groups` into the main entitlements array without removing iCloud keys;
- use `withDangerousMod` to copy the extension template, the Foundation-only `SharedInboxStore.swift`, and the Soundoc mark into generated `ios/SoundocShareExtension`;
- use `withXcodeProject` to create one app-extension target, add Swift sources/resources, configure automatic signing and `LD4FX75VKF`, inherit version/build values, link required system frameworks, and add the `.appex` to the main target's “Embed App Extensions” copy phase;
- make every mutation idempotent and path-independent;
- add `./plugins/withSoundocShareExtension` at the end of `app.json`'s plugin list.

Implement `scripts/verify-clean-share-generation.sh` with this lifecycle:

```bash
#!/usr/bin/env bash
set -euo pipefail
SOUNDOC_PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOUNDOC_GENERATED_ROOT="$(mktemp -d /private/tmp/soundoc-share-prebuild.XXXXXX)"
rsync -a --exclude ios --exclude node_modules --exclude .git "$SOUNDOC_PROJECT_ROOT/" "$SOUNDOC_GENERATED_ROOT/"
ln -s "$SOUNDOC_PROJECT_ROOT/node_modules" "$SOUNDOC_GENERATED_ROOT/node_modules"
cd "$SOUNDOC_GENERATED_ROOT"
npx expo prebuild --platform ios --no-install
node scripts/verify-share-extension.js --project ios/Soundoc.xcodeproj/project.pbxproj
plutil -lint ios/Soundoc/Soundoc.entitlements ios/Soundoc/Info.plist ios/SoundocShareExtension/SoundocShareExtension.entitlements ios/SoundocShareExtension/Info.plist
if [[ "${1:-}" != "--configuration-only" ]]; then
  xcodebuild -workspace ios/Soundoc.xcworkspace -scheme Soundoc -configuration Release -sdk iphonesimulator -derivedDataPath "$SOUNDOC_GENERATED_ROOT/DerivedData" CODE_SIGNING_ALLOWED=NO build
fi
echo "Verified generated project: $SOUNDOC_GENERATED_ROOT"
```

Apply the same generated sources and pbxproj/entitlement deltas to the current ignored `ios/` project with `apply_patch`. Do not run prebuild in the working checkout.

- [ ] **Step 4: Verify plugin idempotence, temporary clean generation, and local target presence**

Run: `node plugins/shareExtensionProject.test.js`

Expected: PASS.

Run: `bash scripts/verify-clean-share-generation.sh --configuration-only`

Expected: the script creates an isolated directory with `mktemp -d`, generates iOS without touching the working checkout, and passes main/extension entitlements, identifiers, deployment target, source membership, and embedding checks.

- [ ] **Step 5: Commit the reproducible native build configuration**

```bash
git add plugins scripts/verify-share-extension.js scripts/verify-clean-share-generation.sh
git add -p app.json
git commit -m "build: configure Soundoc share extension"
```

### Task 5: Shared guarded URL resolver

**Files:**
- Create: `src/lib/urlResolver.ts`
- Create: `src/lib/urlResolver.test.ts`
- Modify: `App.tsx`
- Modify: `scripts/run-quick-read-fixtures.ts`

**Interfaces:**
- Produces: `resolvePublicReadingUrl(input: string | URL, options?: { fetchImpl?: typeof fetch }): Promise<ResolvedReadingSource>` where `ResolvedReadingSource` is `{ kind: 'article'; extraction: ArticleExtraction; initialUrl: string; resolvedUrl: string } | { kind: 'document'; route: DirectDocumentRoute; initialUrl: string; resolvedUrl: string; expectedSize?: number; mimeType?: string }`.
- Consumes: existing `safePublicUrl`, `safePublicRedirectUrl`, `routeDirectDocument`, `isHtmlResponse`, `extractArticleFromHtml`, and `countWords`.

- [ ] **Step 1: Write resolver parity fixtures**

```ts
const result = await resolvePublicReadingUrl('https://example.com/start', { fetchImpl: redirectThenArticleFetch });
if (result.kind !== 'article' || result.resolvedUrl !== 'https://example.com/final') throw new Error('redirect article mismatch');
if (!result.extraction.text.includes('A readable body with enough words')) throw new Error('article extraction missing');

const document = await resolvePublicReadingUrl('https://example.com/download', { fetchImpl: headDocumentFetch });
if (document.kind !== 'document' || document.route.extension !== 'pdf') throw new Error('HEAD document routing mismatch');
```

Cover unsafe redirects, six redirects, non-HTML response, HTTP error, 12 MiB HTML limit, and fewer than 25 readable words. Assert the manual and shared callers receive the same discriminated result for the same mocked response.

- [ ] **Step 2: Run Quick Read fixtures and confirm resolver is missing**

Run: `npm run test:quick-read`

Expected: FAIL with `Cannot find module './urlResolver'`.

- [ ] **Step 3: Move the current `prepareLink` network logic into the resolver**

Keep the HEAD best-effort behavior and guarded manual redirects exactly once in `urlResolver.ts`. Export categorized `PublicReadingError` codes: `invalid-url`, `unsafe-redirect`, `too-many-redirects`, `offline`, `http-status`, `unsupported-content`, `too-large`, and `not-readable`.

Replace the body of `prepareLink` with:

```ts
const resolved = await resolvePublicReadingUrl(draftLink);
if (resolved.kind === 'document') {
  const imported = await beginRemoteDocumentImport(new URL(resolved.resolvedUrl), resolved.route, resolved.expectedSize, resolved.mimeType);
  if (imported) setImportMode(null);
  return;
}
setImportMode(null);
setArticlePreview(resolved.extraction);
```

Retain the existing manual alert text and article preview. Do not save or autoplay manual Web Link imports in this task.

- [ ] **Step 4: Run parity fixtures, typecheck, and manual-import regression fixtures**

Run: `npm run test:quick-read`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: existing article-extractor fixture command through `scripts/run-quick-read-fixtures.ts`.

Expected: every prior article extraction fixture passes.

- [ ] **Step 5: Commit the shared resolver extraction**

```bash
git add src/lib/urlResolver.ts src/lib/urlResolver.test.ts scripts/run-quick-read-fixtures.ts
git add -p App.tsx
git commit -m "refactor: share guarded URL resolver"
```

### Task 6: Auto-play preference with App Group mirroring

**Files:**
- Create: `src/lib/quickReadPreferences.ts`
- Create: `src/lib/quickReadPreferences.test.ts`
- Modify: `scripts/run-quick-read-fixtures.ts`
- Modify: `App.tsx`

**Interfaces:**
- Produces: `QUICK_READ_AUTOPLAY_KEY`, `loadQuickReadAutoplay(storage): Promise<boolean>`, and `saveQuickReadAutoplay(value, storage, nativeInbox): Promise<void>`.
- Consumes: AsyncStorage and module `setAutoPlaySharedLinks`.

- [ ] **Step 1: Write preference fixtures**

```ts
if (await loadQuickReadAutoplay(emptyStorage) !== true) throw new Error('unset preference must default On');
if (await loadQuickReadAutoplay(storageWithFalse) !== false) throw new Error('stored Off preference ignored');
await saveQuickReadAutoplay(false, recordingStorage, recordingInbox);
if (writes[0] !== 'soundoc.quickRead.autoplay=false') throw new Error('AsyncStorage write mismatch');
if (mirrors[0] !== false) throw new Error('App Group mirror mismatch');
```

- [ ] **Step 2: Run fixtures and confirm missing preference module**

Run: `npm run test:quick-read`

Expected: FAIL with `Cannot find module './quickReadPreferences'`.

- [ ] **Step 3: Implement default-On storage and one controlled state in `App.tsx`**

```ts
const QUICK_READ_AUTOPLAY_KEY = 'soundoc.quickRead.autoplay';
const [quickReadAutoplay, setQuickReadAutoplay] = useState(true);
const [quickReadReady, setQuickReadReady] = useState(false);

const updateQuickReadAutoplay = useCallback((enabled: boolean) => {
  setQuickReadAutoplay(enabled);
  void saveQuickReadAutoplay(enabled, AsyncStorage, sharedInbox).catch(() => undefined);
}, []);
```

Load the preference in the existing initialization effect, mirror the resolved value even when the key is absent, and set `quickReadReady` only after resolution. Malformed values resolve to `true`.

- [ ] **Step 4: Run preference fixtures and typecheck**

Run: `npm run test:quick-read`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the synchronized preference**

```bash
git add src/lib/quickReadPreferences.ts src/lib/quickReadPreferences.test.ts scripts/run-quick-read-fixtures.ts
git add -p App.tsx
git commit -m "feat: persist Quick Read autoplay"
```

### Task 7: FIFO shared-link processor and Library/queue/Player decisions

**Files:**
- Create: `src/lib/sharedLinkProcessor.ts`
- Create: `src/lib/sharedLinkProcessor.test.ts`
- Create: `src/lib/readingSourcePersistence.ts`
- Create: `src/lib/readingSourcePersistence.test.ts`
- Modify: `scripts/run-quick-read-fixtures.ts`
- Modify: `App.tsx`

**Interfaces:**
- Produces: `processSharedLinkInbox(dependencies): Promise<SharedProcessingSummary>` with `{ successfulItems, retryable, failed, manualFallbacks }`, plus `persistResolvedArticle(extraction, dependencies)` and `persistResolvedDocument(source, dependencies)`.
- Consumes: module inbox functions, Task 1 canonical lookup, Task 5 resolver, existing save paths supplied as callbacks, existing queue update callback, and Player state/load callbacks.

- [ ] **Step 1: Write processor behavior fixtures**

```ts
const summary = await processSharedLinkInbox(fakeDependencies({ pending: [first, second] }));
assert.deepEqual(events, [
  'processing:first', 'resolve:first', 'persist:first', 'ack:first',
  'processing:second', 'resolve:second', 'persist:second', 'ack:second',
  'load:first:true', 'queue:second', 'navigate:player',
]);
if (summary.successfulItems.length !== 2) throw new Error('FIFO successes missing');
```

Add fixtures proving: an original-URL duplicate skips resolve; a resolved-URL duplicate skips save; duplicate progress remains unchanged; active playback queues every new result and never calls `load`; Auto-play Off calls `load(item, false)`; transient failure marks retryable and does not acknowledge; terminal extraction failure exposes the original URL for the manual importer; a concurrent invocation returns without a second pass.

Add persistence fixtures that pass recording implementations of `makeItem`, `queueLongText`, `downloadRemoteDocument`, `saveLargeDocumentInfo`, and `persist`, then assert manual and Quick Read callers receive the same `LibraryItem` for the same resolved source while only the manual caller creates `Prepared` UI state.

- [ ] **Step 2: Run fixtures and confirm processor is missing**

Run: `npm run test:quick-read`

Expected: FAIL with `Cannot find module './sharedLinkProcessor'`.

- [ ] **Step 3: Implement the dependency-injected processor and app lifecycle hook**

```ts
export type SharedLinkProcessorDependencies = {
  now(): number;
  getPending(): Promise<SharedInboxItem[]>;
  markProcessing(id: string): Promise<void>;
  markRetryable(id: string, code: string, nextAttemptAt: string): Promise<void>;
  acknowledge(id: string): Promise<void>;
  markFailed(id: string, code: string): Promise<void>;
  findDuplicate(urls: readonly string[]): LibraryItem | undefined;
  resolve(url: string): Promise<ResolvedReadingSource>;
  saveArticle(extraction: ArticleExtraction): Promise<LibraryItem>;
  saveDocument(source: Extract<ResolvedReadingSource, { kind: 'document' }>): Promise<LibraryItem>;
  isAudioActive(): boolean;
  load(item: LibraryItem, autoplay: boolean): void;
  appendQueue(items: readonly LibraryItem[]): void;
  navigatePlayer(): void;
};
```

Sort eligible records by `createdAt`, use a module-level or hook-owned mutex, acknowledge only after an existing or newly persisted Library item is available, and apply the three-delay retry policy. A first result may call `load` only when audio is not currently `playing`; later results always append in order. Navigate at most once.

In `App.tsx`, run only after `onboardingComplete !== null`, `quickReadReady`, database initialization, and subscription playback readiness. Trigger on initial readiness and `AppState` transition to `active`. Reuse `queueLongText`, `makeItem`, `persist`, `beginRemoteDocumentImport`-equivalent callback, `updateQueue`, and `player.load`; do not duplicate their internals.

Move the durable parts of `saveArticlePreview` and `beginRemoteDocumentImport` behind `persistResolvedArticle` and `persistResolvedDocument`. Their dependencies perform the current chunk decision, managed-file download, Library save, and large-document processing. The manual wrappers continue to set Article preview/Prepared state; the shared processor receives the returned item directly and never opens those manual modals.

When extraction is terminal, store one manual fallback URL in state. The status surface action sets `draftLink`, opens `ImportMode` `link`, and clears the status.

- [ ] **Step 4: Run processor fixtures, typecheck, and lifecycle smoke test**

Run: `npm run test:quick-read`

Expected: PASS with deterministic event order.

Run: `npm run typecheck`

Expected: PASS.

Run the app in iOS Simulator with the module returning an empty inbox.

Expected: launch, onboarding gating, Home navigation, and existing player resume behavior are unchanged.

- [ ] **Step 5: Commit shared inbox processing**

```bash
git add src/lib/sharedLinkProcessor.ts src/lib/sharedLinkProcessor.test.ts src/lib/readingSourcePersistence.ts src/lib/readingSourcePersistence.test.ts scripts/run-quick-read-fixtures.ts
git add -p App.tsx
git commit -m "feat: process shared links into Soundoc"
```

### Task 8: Reusable Quick Read setting row and Home explanation sheet

**Files:**
- Create: `src/components/QuickReadSettingRow.tsx`
- Create: `src/components/QuickReadSheet.tsx`
- Create: `src/components/QuickReadComponents.test.tsx`
- Create: `src/lib/quickReadCopy.ts`
- Create: `src/lib/quickReadCopy.test.ts`
- Modify: `scripts/run-quick-read-fixtures.ts`
- Modify: `App.tsx`

**Interfaces:**
- Produces: `<QuickReadSettingRow value onValueChange compact? />` and `<QuickReadSheet visible autoplay onAutoplayChange onClose />`.
- Consumes: Task 6 controlled preference state and existing Soundoc theme/toggle components.

- [ ] **Step 1: Add compile-time component fixtures with the required props**

```tsx
<QuickReadSettingRow value={true} onValueChange={() => undefined} />
<QuickReadSheet visible autoplay={false} onAutoplayChange={() => undefined} onClose={() => undefined} />
```

The component contract file imports both components and exports this compile-only function:

```tsx
export function quickReadComponentContract() {
  return <>
    <QuickReadSettingRow value={true} onValueChange={() => undefined} />
    <QuickReadSheet visible autoplay={false} onAutoplayChange={() => undefined} onClose={() => undefined} />
  </>;
}
```

`quickReadCopy.test.ts` asserts that `quickReadCopy` contains exactly `Listen to any webpage`, the `Share → Soundoc` instruction, `Start reading as soon as Soundoc prepares the page.`, and the Share Sheet favorites tip. Register that fixture in `scripts/run-quick-read-fixtures.ts`.

- [ ] **Step 2: Run typecheck and confirm components are missing**

Run: `npm run typecheck`

Expected: FAIL on missing Quick Read components.

- [ ] **Step 3: Build the graphite/orange page sheet and shared row**

`QuickReadSettingRow` uses `SoundocToggle`, label `Auto-play shared links`, helper text `Start reading as soon as Soundoc prepares the page.`, and accessibility value `On`/`Off`.

`QuickReadSheet` uses a page-sheet `Modal`, safe area, a compact webpage → share → Soundoc → waveform visual built from styled native views/text, numbered instructions, a raised preference card, and a favorites tip. Every Pressable has at least a 44-point target, Dynamic Type text can wrap, and the modal uses one vertical ScrollView for accessibility sizes.

Render the sheet in `App.tsx` with one `showQuickRead` boolean and the single Task 6 preference handler.

- [ ] **Step 4: Run typecheck and inspect ordinary/AX5 simulator layouts**

Run: `npm run typecheck`

Expected: PASS.

Set Simulator content size to default and accessibility extra-extra-extra large.

Expected: title, instructions, toggle, helper copy, and Done remain reachable; no text clips or overlaps.

- [ ] **Step 5: Commit the Quick Read explanation experience**

```bash
git add src/components/QuickReadSettingRow.tsx src/components/QuickReadSheet.tsx src/components/QuickReadComponents.test.tsx src/lib/quickReadCopy.ts src/lib/quickReadCopy.test.ts scripts/run-quick-read-fixtures.ts
git add -p App.tsx
git commit -m "feat: add Quick Read guide sheet"
```

### Task 9: Fourth responsive Home import option

**Files:**
- Create: `src/lib/quickReadLayout.ts`
- Create: `src/lib/quickReadLayout.test.ts`
- Modify: `scripts/run-quick-read-fixtures.ts`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `onOpenQuickRead` callback from Task 8.
- Produces: responsive Home import layout with Paste Text, Web Link, Import File, and Share to Soundoc.

- [ ] **Step 1: Add a pure layout decision fixture**

```ts
if (quickReadImportColumns({ width: 390, fontScale: 1 }) !== 2) throw new Error('ordinary phone should use two columns');
if (quickReadImportColumns({ width: 320, fontScale: 1.8 }) !== 1) throw new Error('large type should use one column');
```

- [ ] **Step 2: Run fixtures and confirm layout helper is missing**

Run: `npm run test:quick-read`

Expected: FAIL on `quickReadImportColumns`.

- [ ] **Step 3: Implement the four-card Home group**

Use `useWindowDimensions()` and `PixelRatio.getFontScale()` in `HomeScreen`. Render this order and copy:

```tsx
<ImportButton symbol="T" title="Paste Text" description="Notes and copied text" onPress={() => onImport('text')} />
<ImportButton symbol="↗" title="Web Link" description="Articles and public pages" onPress={() => onImport('link')} primary />
<ImportButton symbol="▤" title="Import File" description="Books and documents" onPress={onUpload} />
<ImportButton symbol="⌁" title="Share to Soundoc" description="Send pages from other apps" onPress={onOpenQuickRead} />
```

At width at least 350 and font scale below 1.45, use two equal columns with `gap: space.sm`; otherwise use one column. Cards use a minimum height of 112 in the grid, vertical content, wrapped descriptions, existing raised/pressed treatments, and accessible hints. Camera/photo controls stay below the group unchanged.

- [ ] **Step 4: Run fixtures, typecheck, and visual Home regression**

Run: `npm run test:quick-read && npm run typecheck`

Expected: PASS.

Capture default and AX5 simulator screenshots.

Expected: default is a balanced 2 × 2 grid; AX5 is one column; Continue Listening, queue, camera/photo, and recent items keep their prior order.

- [ ] **Step 5: Commit the fourth Home option**

```bash
git add src/lib/quickReadLayout.ts src/lib/quickReadLayout.test.ts scripts/run-quick-read-fixtures.ts
git add -p App.tsx
git commit -m "feat: add Share to Soundoc home option"
```

### Task 10: Settings Quick Read configuration area

**Files:**
- Create: `src/screens/SettingsScreen.quickRead.test.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: Task 6 `quickReadAutoplay` and `updateQuickReadAutoplay`, Task 8 `QuickReadSettingRow`.
- Produces: controlled `quickReadAutoplay` and `onQuickReadAutoplayChange` Settings props.

- [ ] **Step 1: Extend the Settings compile fixture before Props**

```tsx
import type { SettingsScreenProps } from './SettingsScreen';

export function settingsQuickReadContract(props: SettingsScreenProps) {
  const enabled: boolean = props.quickReadAutoplay;
  props.onQuickReadAutoplayChange(!enabled);
}
```

Add copy assertions for section title `Quick Read`, setting label `Auto-play shared links`, and helper `Start reading as soon as Soundoc prepares the page.`.

- [ ] **Step 2: Run typecheck and confirm the new Props are rejected**

Run: `npm run typecheck`

Expected: FAIL because `quickReadAutoplay` is not in `SettingsScreenProps`.

- [ ] **Step 3: Add the controlled Settings section**

Rename and export the existing local `Props` type as `SettingsScreenProps`, add the two controlled properties, and place `<Section title="Quick Read">` after Listening and before Quick guide. Render `QuickReadSettingRow` without a second state variable or storage call. Pass the two controlled props from `App.tsx`.

Use supporting copy: `Pages shared from Safari and other apps are cleaned and saved when Soundoc opens.` The entire copy area may announce the feature, while only the switch changes the value.

- [ ] **Step 4: Run typecheck and verify two-way synchronization**

Run: `npm run typecheck`

Expected: PASS.

In Simulator, toggle Off in Settings, open Home → Share to Soundoc, then toggle On in the sheet and return to Settings.

Expected: both surfaces immediately show the same value and the stored key matches the final setting after relaunch.

- [ ] **Step 5: Commit Settings configuration**

```bash
git add src/screens/SettingsScreen.tsx src/screens/SettingsScreen.quickRead.test.tsx src/components/QuickReadSettingRow.tsx
git add -p App.tsx
git commit -m "feat: add Quick Read settings"
```

### Task 11: Intuitive onboarding Quick Read slide

**Files:**
- Create: `src/lib/onboardingGuide.ts`
- Create: `src/lib/onboardingGuide.test.ts`
- Modify: `scripts/run-quick-read-fixtures.ts`
- Modify: `src/components/OnboardingModal.tsx`

**Interfaces:**
- Consumes: existing onboarding frame, animation, swipe, tips, dots, and completion callback.
- Produces: `GuideKind` including `quickRead` and seven correctly numbered slides.

- [ ] **Step 1: Add onboarding structure fixtures**

```ts
if (onboardingSlides[1].kind !== 'quickRead') throw new Error('Quick Read must follow import');
if (onboardingSlides[1].kicker !== '02 · QUICK READ') throw new Error('Quick Read numbering mismatch');
if (onboardingSlides[1].title !== 'Share it. Hear it.') throw new Error('Quick Read title mismatch');
if (onboardingSlides.length !== 7) throw new Error('onboarding should contain seven slides');
```

Define `GuideKind`, `OnboardingSlide`, and `onboardingSlides` in the pure `src/lib/onboardingGuide.ts`; register its fixture with the runner. Also use a source assertion to confirm the storage key remains exactly `soundoc.onboarding.complete` in `App.tsx`.

- [ ] **Step 2: Run the fixture and confirm `quickRead` is not a GuideKind**

Run: `npm run test:quick-read`

Expected: FAIL because the Quick Read slide is absent.

- [ ] **Step 3: Add the slide and purpose-built preview**

Move the existing six slide records unchanged into `onboardingGuide.ts`, import `onboardingSlides` into the component, and insert:

```ts
{
  kind: 'quickRead',
  kicker: '02 · QUICK READ',
  title: 'Share it. Hear it.',
  body: 'Find something worth reading? Share it to Soundoc and listen instead.',
  tips: ['Tap Share in Safari or another app', 'Choose Soundoc from the Share Sheet', 'Auto-play is on — change it from Home or Settings'],
}
```

Renumber Player through Privacy from `03` through `07`. The preview is a single readable horizontal sequence: webpage card, iOS share-arrow symbol, orange Soundoc mark, and three waveform bars. Below it, add an accent-soft `AUTO-PLAY IS ON` pill. Respect Reduced Motion by keeping the existing restrained pulse and not adding another loop.

- [ ] **Step 4: Run fixtures/typecheck and inspect onboarding at default and AX5 text**

Run: `npm run test:quick-read && npm run typecheck`

Expected: PASS.

Open Settings → View welcome again.

Expected: Quick Read is step 2 of 7, instructions read naturally, all dots/navigation remain usable, and completing or skipping writes the unchanged completion key.

- [ ] **Step 5: Commit the onboarding education**

```bash
git add src/components/OnboardingModal.tsx src/lib/onboardingGuide.ts src/lib/onboardingGuide.test.ts scripts/run-quick-read-fixtures.ts
git commit -m "feat: teach Quick Read in onboarding"
```

### Task 12: Status, retry, manual fallback, and privacy copy

**Files:**
- Create: `src/lib/quickReadStatus.ts`
- Create: `src/lib/quickReadStatus.test.ts`
- Modify: `scripts/run-quick-read-fixtures.ts`
- Modify: `App.tsx`
- Modify: `docs/OCR_AND_SHARE_LIMITATIONS.md`
- Modify: `share-extension/README.md`

**Interfaces:**
- Consumes: `SharedProcessingSummary` from Task 7 and existing Web Link importer.
- Produces: one nonblocking app-side status surface and exact user recovery actions.

- [ ] **Step 1: Add state-to-copy fixtures**

```ts
assert.deepEqual(quickReadStatusCopy({ kind: 'preparing' }), { title: 'Preparing article…', action: undefined });
assert.equal(quickReadStatusCopy({ kind: 'offline' }).title, 'Saved for later');
assert.equal(quickReadStatusCopy({ kind: 'manual', url: 'https://example.com/a' }).action, 'Try manual import');
```

- [ ] **Step 2: Run fixtures and confirm status mapper is missing**

Run: `npm run test:quick-read`

Expected: FAIL on `quickReadStatusCopy`.

- [ ] **Step 3: Implement one status surface with bounded visibility**

While running, show `Preparing article…` in a small graphite toast/card that does not cover the tab bar. On retryable failure show `Saved for later` and `Soundoc will prepare this page when you're back online.` On extraction failure show `We saved the link, but couldn't extract the article.` with `Try manual import`; that action opens the existing link modal with the URL prefilled. Success may show `Ready in your Library` briefly, but Player navigation must not create a second success modal.

Never include a full URL in displayed diagnostics or logs. Announce state changes through accessibility live-region semantics. Prevent simultaneous status cards with a single discriminated state value.

Update documentation to state that shared URLs are temporarily stored in the App Group and fetched when Soundoc becomes active; article text remains in the existing local Library.

- [ ] **Step 4: Run fixtures/typecheck and simulate offline/terminal failures**

Run: `npm run test:quick-read && npm run typecheck`

Expected: PASS.

Inject one transient and one terminal fake inbox result in a development-only local session.

Expected: transient remains retryable with no tight loop; terminal action opens the existing prefilled Web Link importer; neither condition crashes or blocks navigation.

- [ ] **Step 5: Commit recovery UI and privacy documentation**

```bash
git add src/lib/quickReadStatus.ts src/lib/quickReadStatus.test.ts scripts/run-quick-read-fixtures.ts docs/OCR_AND_SHARE_LIMITATIONS.md share-extension/README.md
git add -p App.tsx
git commit -m "feat: add Quick Read recovery states"
```

### Task 13: Clean-generation, native build, archive, and regression verification

**Files:**
- Modify as findings require: only files introduced or explicitly listed in Tasks 1–12
- Produce verification artifacts only in: `/private/tmp/soundoc-*`

**Interfaces:**
- Consumes: the complete feature.
- Produces: evidence for TypeScript correctness, clean Expo generation, embedded extension build, and manual UI checks.

- [ ] **Step 1: Run the complete pure and TypeScript suite from a clean output directory**

Run: `npm run test:quick-read`

Expected: PASS for shared-link, resolver, preference, processor, layout, onboarding, and status fixtures.

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Generate a temporary clean iOS project and verify target configuration**

Run: `bash scripts/verify-clean-share-generation.sh --configuration-only`

Expected: one `Soundoc` app target and one embedded `SoundocShareExtension` target; both have the App Group; the main app retains iCloud; bundle identifiers/deployment/version settings match the spec.

- [ ] **Step 3: Build app and extension with signing disabled**

Run: `bash scripts/verify-clean-share-generation.sh`

Expected: all four plist files pass `plutil`, Xcode reports `BUILD SUCCEEDED`, the script reports its unique temporary project path, and that build contains `Soundoc.app/PlugIns/SoundocShareExtension.appex`.

- [ ] **Step 4: Build the existing local native project and attempt a device archive**

Run: `xcodebuild -workspace ios/Soundoc.xcworkspace -scheme Soundoc -configuration Debug -sdk iphonesimulator -derivedDataPath /private/tmp/soundoc-local-share/DerivedData CODE_SIGNING_ALLOWED=NO build`

Expected: `BUILD SUCCEEDED` with embedded extension.

Run: `xcodebuild -workspace ios/Soundoc.xcworkspace -scheme Soundoc -configuration Release -destination 'generic/platform=iOS' -archivePath /private/tmp/soundoc-local-share/Soundoc.xcarchive archive`

Expected: archive succeeds when Apple App Group provisioning is available. If it fails only for missing App ID/App Group profiles, record exact portal actions and do not weaken entitlements or signing settings.

- [ ] **Step 5: Complete simulator visual and functional regression pass**

Verify and capture screenshots for:

- Home default 2 × 2 import grid and AX5 one-column fallback;
- Share to Soundoc sheet instructions and Auto-play toggle;
- Settings Quick Read section synchronized both directions;
- onboarding step 2 of 7 and unchanged completion semantics;
- extension loading, success, duplicate-success, invalid-link error, Dynamic Type, and VoiceOver order;
- foreground import with Auto-play On and Off;
- active audio not interrupted and multiple shared items appended FIFO;
- manual Web Link still opens Article preview;
- Paste Text, Import File, camera/photo, Library open/delete/favorite, queue, Player, free listening, and paywall smoke behavior.

Expected: no crash, clipped text, duplicate Library item, progress reset, Player-screen churn, or regression in the listed flows.

- [ ] **Step 6: Review the final diff and commit verification fixes**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only Quick Read task files plus the user's pre-existing unrelated changes; do not stage unrelated changes.

```bash
git add -p
git diff --cached --name-only
git diff --cached --check
git commit -m "test: verify Share to Soundoc release path"
```

At the interactive staging prompt, accept only Quick Read verification-fix hunks and reject the user's pre-existing header sizing, build-number, and unrelated test changes. Skip this commit entirely when verification required no code correction.

### Task 14: Physical-device and App Store readiness handoff

**Files:**
- Modify: `share-extension/README.md`

**Interfaces:**
- Consumes: successful simulator/build results and available Apple signing state.
- Produces: a precise release checklist separating verified behavior from checks requiring a provisioned iPhone/App Store Connect.

- [ ] **Step 1: Record Apple portal requirements from the archive result**

Document only the actions actually required:

1. Register `group.com.lecoffeeconfit.soundoc`.
2. Enable the group for `com.lecoffeeconfit.soundoc` and `com.lecoffeeconfit.soundoc.ShareExtension`.
3. Register the extension App ID.
4. Refresh development and distribution provisioning profiles.

- [ ] **Step 2: Run the physical-device matrix when a provisioned device is available**

Verify Safari, Chrome, Firefox, Apple News, and Reddit Share Sheets; terminated/backgrounded app handoff; several sequential shares; real offline-to-online recovery; VoiceOver; Share Sheet favorites; production archive/install; and RevenueCat/free-playback enforcement after Auto-play.

Expected: supported public links queue once, appear as normal Library articles, and follow the chosen Auto-play setting without bypassing access checks.

- [ ] **Step 3: Finalize the release handoff**

State which checks passed, which are provisioning-only, and the exact command/output for any blocker. Do not describe physical-device behavior as verified unless it was exercised on that device.

- [ ] **Step 4: Commit the final readiness record**

```bash
git add share-extension/README.md
git commit -m "docs: document Quick Read release checks"
```
