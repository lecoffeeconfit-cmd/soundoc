# Share to Soundoc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register Soundoc in the system share UI and route incoming webpage URLs or shared text into the existing import flow.

**Architecture:** Use Expo SDK 57's `expo-sharing` config plugin to add the native iOS Share Extension and Android share intent filters. Keep payload normalization in a small pure TypeScript helper, then let `App.tsx` feed normalized links/text into the existing deep-link handoff behavior. No background-fetch permission or custom native inbox is required.

**Tech Stack:** Expo SDK 57, `expo-sharing`, React Native `AppState`, TypeScript, existing Soundoc URL validation/import pipeline.

**Spec:** Approved in chat on 2026-08-24; platform requirements are documented in `docs/superpowers/specs/2026-08-23-share-to-soundoc-design.md` where applicable.

## Global Constraints

- Keep Expo SDK 57 package versions aligned with the installed SDK.
- Accept public HTTP/HTTPS URLs and plain text only.
- Preserve the existing custom URL handoff and manual import behavior.
- Do not add background-fetch/data permissions; retain background audio only.
- Do not regenerate native projects with `--clean` or overwrite unrelated user edits.

---

### Task 1: Normalize incoming share payloads

**Files:**
- Create: `src/lib/sharePayloads.ts`
- Create: `src/lib/sharePayloads.test.ts`

**Interfaces:**
- Consumes: Expo-like `{ shareType?: string; value?: string }` payloads.
- Produces: `normalizeIncomingSharePayload(payload)` returning `{ kind: 'url' | 'text'; value: string } | null`.

- [ ] **Step 1: Write the failing test**

Assert that a URL payload returns a normalized URL, text returns trimmed text, blank values return `null`, and unsupported payload types do not become imports.

- [ ] **Step 2: Run the test to verify it fails**

Compile the two TypeScript files to a temporary CommonJS directory with the repository TypeScript compiler and run the generated test. Expected: the helper import or function is missing.

- [ ] **Step 3: Write the minimal implementation**

Use the existing `safePublicUrl` helper for URL validation. Treat `shareType: 'url'` as a URL only when it is public; treat `shareType: 'text'` as text; reject empty/unsupported payloads.

- [ ] **Step 4: Run the test to verify it passes**

Run the same temporary compile-and-execute command and confirm all fixtures pass.

### Task 2: Register native incoming sharing

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`

**Interfaces:**
- Consumes: Expo SDK 57 config plugin options.
- Produces: an iOS Share Extension accepting webpages, web URLs, and text; Android single-share filters for URLs/text.

- [ ] **Step 1: Install the SDK-aligned dependency**

Run `npx expo install expo-sharing` and confirm the installed version matches Expo SDK 57.

- [ ] **Step 2: Add the config plugin**

Register `expo-sharing` with iOS enabled, App Group `group.com.lecoffeeconfit.soundoc`, activation rules for one webpage URL, one web URL, and text, plus Android `text/plain` and `text/uri-list` filters.

- [ ] **Step 3: Verify generated config**

Run Expo config evaluation and inspect the generated plugin result for the Share Extension settings. Do not add `UIBackgroundModes` for the extension.

### Task 3: Consume incoming shares in the app

**Files:**
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `Sharing.getSharedPayloads()` and `Sharing.clearSharedPayloads()`.
- Produces: cold-start and foreground handling that uses the existing shared text/link handoff path.

- [ ] **Step 1: Write the failing integration assertion**

Extend the payload fixture to cover multiple payloads and ensure only supported normalized payloads are handed off.

- [ ] **Step 2: Run the fixture to verify it fails**

Confirm the new assertion fails before app wiring exists.

- [ ] **Step 3: Wire the share API**

Read and normalize incoming payloads on mount and when `AppState` becomes active. Reuse the existing `acceptShareHandoff` logic, clear consumed payloads, and swallow unsupported-platform/API errors without affecting ordinary launches.

- [ ] **Step 4: Run type and fixture verification**

Run the payload fixture and `npx tsc --noEmit`.

### Task 4: Native build verification and documentation

**Files:**
- Modify: `share-extension/README.md`
- Modify: `README.md` if the current limitation statement is obsolete.

- [ ] **Step 1: Evaluate native generation**

Run the non-clean Expo prebuild/config verification needed to confirm the extension target and App Group can be generated without altering unrelated source files.

- [ ] **Step 2: Validate the generated metadata**

Confirm the extension activation rule contains webpage/web URL/text support and the main app retains only its existing audio background mode.

- [ ] **Step 3: Update the handoff documentation**

Document that a new native build is required and that Background App Refresh/data access is not part of Share Sheet registration.

- [ ] **Step 4: Run the complete verification set**

Run all repository fixture tests available, the share fixture, TypeScript checking, and Expo config evaluation. Report any platform-only checks that require a physical device.
