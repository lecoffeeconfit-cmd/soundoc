# Share local files to Soundoc design

## Summary

Soundoc will extend its existing native Share Extension so users can send supported local documents and images from other iPhone apps, including Files, without changing the current webpage URL or plain-text share behavior. Shared documents will enter the same managed-storage, extraction, chunking, Library, and playback paths already used by Soundoc's Files picker and remote document imports.

The first implementation will support one shared file at a time for TXT, Markdown, HTML, RTF, DOCX, EPUB, and PDF. Images will route through the existing local OCR flow. Unsupported files, multiple-file shares, and media files will receive a clear fallback message and will not be persisted. Web URLs and selected text remain unchanged.

## Goals

- Add local file sharing to the existing iOS Share Extension and Android share intent.
- Reuse the existing document importers, managed storage, size limits, chunked processing, OCR, and Library persistence.
- Preserve the current URL and plain-text share behavior exactly.
- Copy shared files into Soundoc-managed storage before the native share payload is cleared or its temporary access expires.
- Show the same review/preparation states used by existing document and OCR imports.
- Keep unsupported payloads safe, explicit, and non-destructive.
- Verify payload normalization, file routing, existing URL/text compatibility, TypeScript compilation, and a fresh native bundle.

## Non-goals

- No change to the existing article extraction algorithm in this feature.
- No arbitrary audio/video sharing or playback import.
- No multi-file batch import in the first release.
- No cloud upload, server-side parsing, or new document parser.
- No replacement of the Files picker or the current manual import paths.

## Existing architecture and constraints

The app uses Expo SDK 57, `expo-sharing`, and a native iOS Share Extension configured in `app.json`. The current activation rule accepts one webpage, one web URL, or plain text; Android accepts `text/plain` and `text/uri-list`. The JavaScript handler reads raw payloads through `Sharing.getSharedPayloads()`, normalizes only `url` and `text`, and clears the payload after handling it.

Soundoc already supports TXT, Markdown, HTML, RTF, DOCX, EPUB, and PDF through `importDocument` and its Files picker flow. Large files are copied to managed storage and processed through the chunked-document path. Image imports already use device OCR and present an editable review state before saving. These paths are the source of truth and must remain behaviorally unchanged for their existing callers.

Expo SDK 57 exposes file/image/attachment activation rules and resolved payloads with a content URI. The native share configuration requires a new development, preview, or production binary after changes; Expo Go is not a supported test target for the native Share Extension.

## Payload model and routing

The normalized share model will be extended with a discriminated file/image form while retaining the existing URL/text forms:

- `url`: public HTTP/HTTPS URL; existing validation and link-preview path.
- `text`: plain text; existing selected-text path with no new destructive cleanup.
- `file`: local URI plus optional MIME type, suggested filename, and size; new document import path.
- `image`: local URI plus optional filename and size; existing OCR review path.

Raw payload handling will prefer resolved payloads when available so file shares expose a usable content URI, MIME type, and suggested filename. A narrow raw-payload fallback will support platforms where only a file URI is available. Unknown share types are ignored with a user-visible fallback rather than being treated as text.

The app will not clear the native payload until it has either accepted it into a durable in-memory/import state or shown a terminal unsupported/error state. The file URI will be copied immediately into managed storage before the native payload is cleared. The copy path will enforce the existing maximum size before expensive extraction.

## Native configuration

`app.json` will be extended additively:

- iOS: enable one file share, one attachment share where needed for document providers, and one image share; keep webpage, web URL, and text rules unchanged.
- Android: retain `text/plain` and `text/uri-list`; add the supported document MIME types and `image/*` for single shares.

The configuration will not change the bundle identifier, App Group, URL scheme, existing plugin settings, or current Share Extension branding. A clean native build must include the updated activation rules; no destructive prebuild operation will be run against the working checkout.

## Main-app file flow

The new file handler will:

1. Validate the resolved content URI, suggested filename, MIME type, and size.
2. Map the filename/MIME type to the existing supported document format or image OCR route.
3. Copy a document into the same managed storage used by `beginLargeDocumentImport`.
4. Create the existing chunked Library item and large-document metadata.
5. Start `processLargeDocument` and update the existing preparation state as sections become ready.
6. For images, invoke the current OCR flow and show its editable draft rather than silently saving recognition output.
7. Clear the native share payload only after the accepted handoff is durable or the payload is definitively unsupported.

The current URL handler, plain-text handler, Files picker, manual link preview, and OCR entry points will remain separate callers. Shared documents will not be routed through `makeItem` with empty text unless the existing chunked import has already created the corresponding durable source metadata.

## Main-content and speech quality

This feature will not apply article-style cleanup to arbitrary plain text. A selected note or passage is user-selected content and should be preserved. Existing speech preferences will continue to remove obvious URLs, citations, references, repeated lines, and site boilerplate at playback time where the user has enabled those rules.

Web URL shares will continue using the existing article extractor, which already prefers structured article bodies and semantic containers, removes common page chrome, trims reference tails, and reports confidence warnings. Any future extraction-quality work will be covered separately with article fixtures so local-file support does not alter web-page behavior.

## Error handling

- Unsupported extension/MIME: show “Soundoc can’t read this file type yet. Use Files or Photos with a supported document.”
- File too large: reuse the existing safe-size error.
- Missing or expired URI: show a retryable share-import message and leave the existing Library unchanged.
- Malformed payload: clear only the malformed payload and avoid crashing or changing existing imports.
- Multiple files: process the first supported file only if the platform marks the share as a single payload; otherwise show a clear single-file limitation.
- OCR failure: reuse the current “Couldn’t read that image” review guidance.

## Tests and verification

- Extend payload fixtures for file, image, URL, text, unsupported, and missing-value cases.
- Add routing fixtures proving each supported extension reaches the existing document path and images reach OCR without changing URL/text results.
- Add a source/config contract test for iOS and Android activation rules.
- Run focused fixtures and full `npx tsc --noEmit`.
- Run `npx expo export --platform ios` to verify the native JavaScript bundle includes the new handlers and asset paths.
- Test manually in an installed development build on the iOS Simulator: Safari URL, selected Notes text, Files TXT/PDF/DOCX, and Photos image shares; confirm the existing Files picker still behaves identically.

## Rollout and compatibility

The change is additive and requires a new native build because Share Extension activation rules are compiled into the binary. Existing installed builds continue to behave as before. If a new build does not include the extension, the in-app Files picker remains the supported fallback.
