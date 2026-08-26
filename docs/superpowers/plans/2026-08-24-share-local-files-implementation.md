# Share local files to Soundoc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-safe local file receiving to Soundoc’s existing native Share Extension while preserving the current webpage URL, selected-text, Files picker, remote document, and image OCR flows.

**Architecture:** Extend the existing pure share-payload normalizer with resolved file/image payloads, route supported files through a small pure file-routing module, and let `App.tsx` hand accepted files to the same managed-storage/chunked document and OCR paths already used by the Files and Photos entry points. Native activation rules will be expanded additively in `app.json`; no new parser or native inbox will be introduced.

**Tech Stack:** Expo SDK 57, `expo-sharing` resolved payloads, `expo-file-system`, existing `largeDocuments.ts` import pipeline, existing OCR module, TypeScript fixture tests, Expo config/export validation.

**Spec:** Approved in chat on 2026-08-24 and documented in `docs/superpowers/specs/2026-08-24-share-file-import-design.md`.

## Global Constraints

- Keep Expo SDK 57 package versions aligned with the installed SDK; `expo-sharing` is already installed and does not need a new dependency.
- Keep URL and plain-text normalization and handoff behavior unchanged, including public URL validation and preserving selected text verbatim apart from existing trimming.
- Support one local file at a time for TXT, Markdown, HTML, RTF, DOCX, EPUB, PDF, and image files routed through OCR. Do not import audio, video, archives outside the existing supported formats, or multi-file batches in this release.
- Copy accepted document files into Soundoc-managed storage before clearing the native share payload. Never delete provider-owned originals.
- Reuse existing size limits, safe error messages, managed storage, chunked processing, Library persistence, and OCR review UI.
- Do not change the existing article extraction algorithm; local shared text is not article HTML and must not receive destructive page-chrome cleanup.
- Do not regenerate native projects with `--clean`, overwrite unrelated user edits, submit builds, or change production credentials.
- Keep Expo Go compatibility graceful: native share receiving and native OCR require a development/preview/production build.

## File map and responsibilities

- `src/lib/sharePayloads.ts`: pure raw/resolved payload normalization for URL, text, file, and image forms.
- `src/lib/sharePayloads.test.ts`: regression fixtures proving existing URL/text behavior and new resolved/raw file/image behavior.
- `src/lib/sharedFileRouting.ts`: pure MIME/extension/size/name routing to document, image, or unsupported.
- `src/lib/sharedFileRouting.test.ts`: supported-format, MIME fallback, filename fallback, image, oversized, and unsupported fixtures.
- `src/lib/importCapabilities.ts`: shared supported-extension constants so Share routing and existing Files import claims stay aligned.
- `src/lib/largeDocuments.ts`: consume the shared document-format list without changing the existing copy/process behavior.
- `App.tsx`: resolve incoming native payloads, route one accepted file, reuse the existing document/OCR state transitions, and clear payloads only after durable/terminal handling.
- `app.json`: expand iOS and Android share activation rules while retaining current URL/text entries and App Group settings.
- `src/lib/sharePayloadConfig.test.ts`: contract-check the checked-in Expo sharing configuration.
- `share-extension/README.md`, `docs/OCR_AND_SHARE_LIMITATIONS.md`, and `README.md` only where their current limitation text becomes stale: document native-build requirements and supported local-share types.

---

### Task 1: Extend the pure share payload model

**Files:**
- Modify: `src/lib/sharePayloads.ts`
- Modify: `src/lib/sharePayloads.test.ts`

**Interfaces:**
- Raw payload input: `{ shareType, value, mimeType? }`.
- Resolved payload input: `{ shareType, value, mimeType?, contentUri, contentType?, contentMimeType?, originalName?, contentSize? }`.
- Output remains `{ kind: 'url' | 'text'; value }` for existing inputs and adds `{ kind: 'file' | 'image'; uri; name; mimeType?; size? }` for accepted local payloads.

- [ ] **Step 1: Write failing fixtures first**

  Add cases for a resolved PDF, DOCX, image, text, and URL; a raw file URI fallback; missing URI/name; an unsupported media type; and a mixed batch. Keep the current public URL, trimmed text, blank, private URL, and unsupported-type assertions unchanged.

- [ ] **Step 2: Run the focused fixture and confirm failure**

  ```sh
  rm -rf /private/tmp/soundoc-share-file-fixtures
  npx tsc --target ES2022 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --strict --outDir /private/tmp/soundoc-share-file-fixtures src/lib/sharePayloads.ts src/lib/sharePayloads.test.ts
  node /private/tmp/soundoc-share-file-fixtures/src/lib/sharePayloads.test.js
  ```

  Expected: the new file/image assertions fail because the existing normalizer only returns URL/text forms.

- [ ] **Step 3: Implement the minimal normalizer extension**

  Add a shared payload input type that accepts both raw and resolved metadata. Prefer `contentUri` and resolved metadata when present; use the raw file URI only as a narrow fallback. Normalize URL/text exactly as today, preserve text content without article cleanup, reject unsupported share types, reject missing/blank values, and never reinterpret an unknown attachment as text.

- [ ] **Step 4: Run the focused fixture and confirm pass**

  Re-run the compile-and-node command above, then run `npx tsc --noEmit` after the app integration is complete.

### Task 2: Add pure supported-file routing and align existing format lists

**Files:**
- Create: `src/lib/sharedFileRouting.ts`
- Create: `src/lib/sharedFileRouting.test.ts`
- Modify: `src/lib/importCapabilities.ts`
- Modify: `src/lib/largeDocuments.ts`

**Interfaces:**
- Input: filename, optional MIME type, optional size.
- Output: `{ kind: 'document'; fileName; mimeType?; size? }`, `{ kind: 'image'; fileName; mimeType?; size? }`, or `{ kind: 'unsupported'; reason }`.

- [ ] **Step 1: Add failing routing fixtures**

  Cover every existing document extension (`txt`, `md`, `markdown`, `html`, `htm`, `rtf`, `pdf`, `docx`, `epub`), MIME-only document routing when the filename has no useful extension, image MIME/extension routing, unknown files, unsupported audio/video, missing names, and sizes over `MAX_EXTRACTABLE_DOCUMENT_BYTES`.

- [ ] **Step 2: Run the routing fixture and confirm failure**

  Use the same temporary CommonJS fixture pattern as Task 1. Expected: the module/function is missing.

- [ ] **Step 3: Implement routing from one supported-format source**

  Export a single supported document-extension list from `importCapabilities.ts`, make `largeDocuments.ts` consume it for its existing `shouldUseChunkedDocument` behavior, and have the new router use that same list. Match MIME types narrowly, allow `image/*` only for the OCR route, derive a safe fallback filename when providers omit one, and return an explicit oversized result before any copy begins.

- [ ] **Step 4: Run routing fixtures and verify existing document behavior**

  Run the focused routing fixture and the existing import/document fixtures if present. Confirm no changes to the existing `copyLargeDocumentToManagedStorage`, parser, or chunk-processing contracts beyond the shared extension constant.

### Task 3: Wire resolved native payloads into the existing import flows

**Files:**
- Modify: `App.tsx`
- Modify: `src/lib/sharePayloads.ts` only if the final Expo payload type requires a narrow compatibility adjustment.

**Interfaces:**
- Consumes `Sharing.getSharedPayloads()`, `Sharing.getResolvedSharedPayloadsAsync()`, and `Sharing.clearSharedPayloads()`.
- Produces the existing prepared-document state for files and existing editable OCR draft state for images.

- [ ] **Step 1: Add a failing integration contract/fixture**

  Add a pure handoff contract fixture or source-level assertion proving that URL/text payloads still use their existing branches, a document payload calls the managed document import path, an image payload calls OCR review, and unsupported payloads do not create Library items. Keep the fixture independent of React Native runtime APIs.

- [ ] **Step 2: Run the contract fixture and confirm failure**

  Compile and execute the focused fixture before modifying `App.tsx`; expected failure is the missing file/image route contract.

- [ ] **Step 3: Refactor only the shared document handoff seam**

  Extract the common “copy managed file → create large-document info → create Library item → persist → prepare → start processing” work from `beginLargeDocumentImport` into a reusable callback that accepts the existing DocumentPicker asset shape and the normalized share-file shape. Keep Files picker duplicate detection, user prompts, and existing messages intact. Use the existing `copyLargeDocumentToManagedStorage` and `safeDocumentError` path so shared files are copied before the native payload is cleared.

- [ ] **Step 4: Add shared-image OCR handoff**

  Add a callback that sends a shared image URI through `recognizeImageText`, creates the existing editable `ocrDraft`, and does not silently persist OCR output. Keep Photos/camera selection behavior unchanged; a shared image is a separate caller with a share-specific source label.

- [ ] **Step 5: Make share consumption async and lifecycle-safe**

  Read raw payloads synchronously, attempt `getResolvedSharedPayloadsAsync()` when available, and fall back to raw payloads if resolution fails. Guard against duplicate processing from cold start plus `AppState` activation. Process the first supported payload only, show explicit unsupported/oversized/missing-URI feedback, and clear the native payload only after the file has been copied, the OCR draft is created, or a terminal unsupported/malformed state has been shown. Preserve the existing Expo Go/web catch behavior.

- [ ] **Step 6: Run app verification**

  Run `npx tsc --noEmit`, the share/routing fixtures, and `git diff --check`. Confirm the existing URL and plain-text handoff source remains unchanged except for the additive file/image branches.

### Task 4: Expand native Share Extension activation rules

**Files:**
- Modify: `app.json`
- Create: `src/lib/sharePayloadConfig.test.ts`

**Interfaces:**
- iOS: retain webpage, web URL, and text activation; add one file, one attachment, and one image.
- Android: retain `text/plain` and `text/uri-list`; add the exact supported document MIME types and `image/*` for single shares.

- [ ] **Step 1: Write the failing config contract**

  Assert the current App Group, existing URL/text rules, and the new file/attachment/image rules. Assert Android keeps the existing MIME types and includes PDF, EPUB, DOCX, HTML, Markdown, RTF, and image support without adding broad audio/video filters.

- [ ] **Step 2: Run the config contract and confirm failure**

  Execute the fixture against the current `app.json`; expected failure is the missing local-file activation entries.

- [ ] **Step 3: Update only the sharing plugin options**

  Preserve the bundle identifier, App Group, URL scheme, existing plugins, and unrelated dirty-worktree changes. Do not add background modes or permissions.

- [ ] **Step 4: Validate evaluated Expo config**

  Run the config contract plus `npx expo config --type public --json` and inspect the evaluated `expo-sharing` plugin settings for both platforms.

### Task 5: Refresh user-facing capability and rollout documentation

**Files:**
- Modify: `share-extension/README.md`
- Modify: `docs/OCR_AND_SHARE_LIMITATIONS.md`
- Modify: `README.md` only where it still states that local file Share Sheet receiving is unavailable.

- [ ] **Step 1: Update the docs after behavior is implemented**

  Document supported local file types, image-to-OCR review behavior, the one-file limitation, unsupported media behavior, and the requirement for a new native development/preview/production build. Keep the existing Files picker fallback and current web URL/plain-text behavior documented.

- [ ] **Step 2: Check docs for stale claims**

  Search for “not yet”, “file-share activation”, and old URL/text-only limitations. Update only claims made obsolete by this implementation; do not promise scanned-PDF OCR or multi-file imports.

### Task 6: Production-oriented verification and simulator smoke test

**Files:**
- No new source files; verification only.

- [ ] **Step 1: Run focused and full static verification**

  ```sh
  npx tsc --noEmit
  npx expo config --type public --json
  npx expo export --platform ios
  git diff --check
  ```

  Run all focused source fixtures, including the existing UI/import fixtures and the new share/routing/config fixtures.

- [ ] **Step 2: Verify the native bundle/config boundary**

  Confirm the iOS export succeeds and the evaluated config contains the expanded activation rules. Do not claim TestFlight support from JavaScript export alone; a fresh native development/preview/production build is required because Share Extension rules are compiled into the binary.

- [ ] **Step 3: Smoke-test on an installed native build**

  On the iOS Simulator or a development build, test Safari URL sharing, selected Notes text, Files TXT/PDF/DOCX sharing, and Photos image sharing. Confirm the existing in-app Files picker, manual URL import, and text import still work. Record any simulator limitation for provider-owned Files/Photos share extensions separately from code verification.

- [ ] **Step 4: Review the final diff and hand off**

  Inspect only the feature files plus the pre-existing user changes, verify no temporary artifacts or credentials were added, and report exact commands/results. If the repository still prevents Git index writes, leave changes uncommitted and state that clearly rather than touching unrelated work.

## Plan self-review

- **Spec coverage:** URL/text compatibility, local document/image support, managed-copy timing, size limits, unsupported payload safety, native activation, no article-cleanup change, and build rollout requirements are each represented above.
- **File coverage:** every implementation file identified by the approved design has a task; documentation changes are limited to stale capability statements.
- **Placeholder scan:** no TODOs, TBDs, or unspecified implementation steps are required; platform-only verification is explicitly called out.
- **Type consistency:** normalized payloads are discriminated by `kind`; document and image routes carry URI/name/metadata needed by existing import APIs; URL/text retain their current shape.
