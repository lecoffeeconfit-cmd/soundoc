# Automatic Chapter Detection Design

## Goal

Automatically detect meaningful chapters or sections when a new listening object is imported, including book-sized PDFs, and make those boundaries easy to understand and navigate while listening.

## Scope

This change applies only to new imports. Existing library items are not rescanned or rewritten, so their saved sentence, character, chunk, and section positions remain unchanged. Future imports of text, articles, DOCX, EPUB, PDF, Markdown, HTML, RTF, and OCR-reviewed images use the same detection pipeline.

Image-only or password-protected PDFs continue to use the existing readable-text/OCR error path; this feature does not add OCR.

## Current State

Soundoc already has two related representations:

- `LibraryItem.sections` stores sections for inline documents and is used by summaries, read-along text, and reader navigation.
- `document_chunks.sectionId` and `document_chunks.sectionTitle` store persistent section membership for long imports and are exposed through `listDocumentChapters`.

The existing section detector is primarily line-based and the long-document path only promotes the first heading-like line in each persisted chunk. This can miss chapters when extracted book text has front matter, repeated PDF headers/footers, numbered headings, or a chapter title separated from its body.

## Design

### Import-time chapter detection

Add a focused, pure detector that accepts normalized text plus an optional source title/format and returns the same `SoundocSection[]` shape already consumed by the app. Detection operates on line boundaries preserved by the existing importers.

The detector gives the strongest weight to explicit patterns:

- `Chapter 1`, `Chapter IV`, and written-number variants.
- `Part Two`, `Section 3`, and similar structural labels.
- Numbered headings such as `1. The Beginning` or `2.3 Methods`.
- Conventional front/back matter names such as `Preface`, `Prologue`, `Introduction`, `Epilogue`, `Conclusion`, `Appendix`, and `Afterword`.
- Markdown heading markers.

Short title-like lines may be accepted only when they are not sentence-shaped, are bounded in length, and are separated from surrounding prose. All-caps lines remain a lower-confidence fallback rather than a universal chapter signal.

The detector filters likely PDF extraction noise before scoring headings: repeated identical lines, page-number-only lines, very short artifacts, and lines that recur at a regular interval. It preserves source text and does not remove content from playback; cleanup is limited to deciding section boundaries.

If no candidate reaches the confidence threshold, return one section titled from the imported document title. The import remains fully playable and the UI labels this as a single section rather than claiming chapters were found.

### Shared storage behavior

Use the detector result as the canonical section list for both import paths:

- Inline imports save the sections through the existing `sections_json` field.
- Chunked imports build persisted chunks from the detected sections, carrying each section’s stable ID and title onto every chunk in that section.

The chunk pipeline must not create a second, conflicting chapter ID based only on chunk boundaries. Chunking inside a long section keeps the section ID/title from the detector. If a section is longer than a persisted chunk, all child chunks remain in the same chapter.

### Import confirmation

When chapters/sections are available, the prepared-import surface includes a compact summary such as `8 chapters detected` alongside the existing word count and duration metadata. When the detector falls back to one section, use `1 reading section` rather than implying a false chapter structure. The summary is informational and never blocks playback.

### Reader experience

Add a current-section affordance to the existing reader surface without changing the speech player contract:

- Show the current chapter/section title near the read-along and progress context.
- Make the affordance a clearly labeled button, with a calm title/subtitle hierarchy consistent with Soundoc’s tactile cards and existing sheets.
- Open a bottom-sheet/page-sheet chapter navigator with ordered rows, section title, approximate duration or word count where available, and an active marker for the current section.
- Selecting a row jumps to its first sentence/chunk using the existing `jumpToSection`/`jumpToChunk` paths, closes the sheet, and preserves the existing resume state semantics.
- Keep bookmarks available in the same flow; chapter navigation is a sibling tab/action, not a replacement for bookmarks.

The existing `BookmarksModal`/section navigation can be extended rather than introducing a second, competing navigation model.

## Error Handling

- Malformed or low-signal extracted text falls back to one section and remains playable.
- Repeated PDF headers/footers must not create dozens of sections.
- Existing import size, archive safety, PDF password, and OCR-required safeguards remain unchanged.
- A chapter-navigation failure should leave the reader usable; it should not stop playback.

## Testing

Use test-first development for the pure detector and chunk integration. Cover:

1. Explicit chapter labels with Arabic, Roman, and written numbers.
2. Part/section and conventional front/back matter headings.
3. Numbered headings and Markdown headings.
4. Repeated PDF-like header/footer noise and page-number-only lines.
5. Prose with no reliable headings falling back to one section.
6. A long section split into multiple chunks while retaining one section ID/title.
7. Multiple detected sections becoming ordered persistent chapters.
8. Existing inline and chunked storage contracts remaining compatible.

Run the relevant unit tests first, then the project’s complete test/typecheck/build commands available in the repository. Validate the reader/import surfaces through the project’s supported Expo SDK 57 development workflow when a native run is available.

## Non-Goals

- Rescanning or mutating existing library items.
- OCR for image-only PDFs.
- Cloud/LLM-based chapter inference.
- User editing/renaming of chapters in this first pass.
- Reworking the speech player or adding a new persistence table.
