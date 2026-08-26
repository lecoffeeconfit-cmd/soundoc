# Automatic Chapter Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect reliable chapters for new imports, preserve them through inline and chunked storage, and expose them through the existing import confirmation and reader navigation surfaces.

**Architecture:** Add a pure line-based chapter detector in `src/lib/chapterDetection.ts`, make `sectionsFromText` use it, and make long-document chunking consume the detected section list instead of inferring a new chapter at every chunk boundary. Reuse the current `BookmarksModal` and `document_chunks` navigation contract for the UI, adding only the current-section import summary and chapter metadata needed for a polished list.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, existing SQLite persistence, existing `SoundocSection` and `DocumentTextChunk` types.

**Spec:** `docs/superpowers/specs/2026-08-25-chapter-detection-design.md`

## Global Constraints

- Apply chapter detection to new imports only; do not migrate or rewrite existing library rows.
- Preserve current Expo SDK `~57.0.13` and existing picker/filesystem APIs; do not add dependencies.
- Keep low-confidence documents playable with one fallback reading section.
- Keep image-only/password-protected PDF safeguards unchanged; do not add OCR or cloud inference.
- Follow test-first development: each behavior gets a failing fixture before production code.
- Use `apply_patch` for source edits and avoid staging unrelated dirty-worktree files.

---

### Task 1: Build the pure chapter detector

**Files:**
- Create: `src/lib/chapterDetection.ts`
- Create: `src/lib/chapterDetection.test.ts`
- Modify: `src/lib/documents.ts`

**Interfaces:**
- Produces `detectDocumentSections(text: string, title?: string): SoundocSection[]` for importers, manual text, OCR text, and chunk preparation.
- `sectionsFromText` remains the public compatibility function and delegates to `detectDocumentSections`.

- [ ] **Step 1: Write failing fixtures**

  Add `runChapterDetectionFixtures()` with assertions for:

  ```ts
  const sections = detectDocumentSections(`Preface\nA short opening.\n\nChapter I\nThe first body.\n\nChapter 2: Turning Point\nThe second body.`, 'Book');
  if (sections.map((section) => section.title).join('|') !== 'Preface|Chapter I|Chapter 2: Turning Point') throw new Error('Explicit chapter headings should become ordered sections');

  const numbered = detectDocumentSections(`1. The Beginning\nOpening text.\n\n2. Methods\nMethod text.`, 'Report');
  if (numbered.length !== 2 || numbered[1]?.title !== '2. Methods') throw new Error('Numbered headings should be detected');

  const noisy = detectDocumentSections(`My Book\n1\nMy Book\nChapter 1\nThe body.\nMy Book\n1\nChapter 2\nMore body.`, 'My Book');
  if (noisy.length !== 2 || noisy.some((section) => section.title === 'My Book' || section.title === '1')) throw new Error('Repeated PDF noise must not create chapters');

  const fallback = detectDocumentSections('This is a continuous essay with no reliable heading candidates. It should remain one readable section.', 'Essay');
  if (fallback.length !== 1 || fallback[0]?.title !== 'Essay') throw new Error('Low-signal text should fall back to one titled section');
  ```

- [ ] **Step 2: Run the fixture and verify the expected failure**

  Run: `node --import tsx src/lib/chapterDetection.test.ts` when the local runtime supports `tsx`; otherwise run the repository’s TypeScript test harness after adding the fixture export.

  Expected: FAIL because `src/lib/chapterDetection.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal detector**

  Normalize line endings, remove empty lines, count repeated exact normalized lines, discard page-number-only artifacts, and score candidates using explicit chapter/part/section labels, numbered headings, Markdown headings, conventional front/back matter, and bounded title-like lines. Only accept candidates with enough surrounding content or an explicit structural pattern. Build sections with stable `section-1`, `section-2`, … IDs, ordered `order`, heading level, and body text. Return one titled section when no candidates qualify.

- [ ] **Step 4: Wire the compatibility function**

  Replace the current private heading heuristic in `src/lib/documents.ts` with `detectDocumentSections(text, title)`, retaining the existing `SoundocSection` return type and all callers.

- [ ] **Step 5: Run the detector fixtures**

  Run the same fixture command and confirm all explicit, numbered, noisy, and fallback cases pass.

- [ ] **Step 6: Commit the focused detector changes**

  Run: `git add src/lib/chapterDetection.ts src/lib/chapterDetection.test.ts src/lib/documents.ts && git commit -m "feat: detect chapters in imported text"`.

### Task 2: Preserve detected chapters in long-document chunks

**Files:**
- Modify: `src/lib/largeDocuments.ts`
- Create: `src/lib/largeDocuments.chapter.test.ts`
- Modify: `src/lib/importers.ts` only if the integration test identifies an importer path that bypasses `sectionsFromText`.

**Interfaces:**
- Consumes `ImportedDocument.sections` produced by `enrichImportedDocument` and the detector-backed `sectionsFromText`.
- Produces `DocumentTextChunk` rows whose `sectionId` and `sectionTitle` remain stable across all chunks within a detected chapter.

- [ ] **Step 1: Write failing chunk fixtures**

  Exercise the exported `makePersistentChunks` with a long first section and a second section, asserting that multiple chunks from the first section share one `sectionId`/`sectionTitle`, and that later sections receive the next IDs in order. Add a fixture for `sectionsFromText` output passed through the imported-document path.

- [ ] **Step 2: Run the chunk fixtures and verify failure**

  Run: `node --import tsx src/lib/largeDocuments.chapter.test.ts`.

  Expected: FAIL because the current generic chunker can create chapter IDs from chunk boundaries and does not carry a canonical section list through every chunk.

- [ ] **Step 3: Refactor chunk construction around canonical sections**

  Keep `makeImportedDocumentChunks` as the section-aware path. Ensure it passes each section’s stable ID directly into `makePersistentChunks`, and remove the generic `findChapterHeading` promotion from that path. For streamable text that is chunked before full extraction, buffer enough normalized source text to detect headings at section boundaries or run the detector on the imported text before chunking when the file can be read safely; never overwrite an existing section ID/title with a chunk-derived ID.

- [ ] **Step 4: Keep EPUB structure and other importer metadata intact**

  Preserve EPUB spine sections, PDF page counts, DOCX/HTML metadata, and existing error handling. Ensure `enrichImportedDocument` supplies detector sections whenever an importer did not provide authoritative sections.

- [ ] **Step 5: Run chunk and existing document tests**

  Run: `node --import tsx src/lib/largeDocuments.chapter.test.ts` and the existing document navigation/metrics fixtures. Confirm `listDocumentChapters` still returns one row per canonical section.

- [ ] **Step 6: Commit the storage integration**

  Run: `git add src/lib/largeDocuments.ts src/lib/largeDocuments.chapter.test.ts src/lib/importers.ts && git commit -m "feat: preserve detected chapters in document chunks"`.

### Task 3: Add import confirmation chapter summary

**Files:**
- Modify: `App.tsx`
- Modify: `src/lib/strings.ts` only if shared copy is needed.

**Interfaces:**
- Consumes `Prepared.item.sections`, `processingStatus`, and existing prepared-modal metadata.
- Produces a non-blocking summary such as `8 chapters detected` or `1 reading section`.

- [ ] **Step 1: Add a contract fixture for prepared copy**

  Add a small source contract assertion beside the existing app-level fixtures that requires the prepared surface to render chapter/section count from `item.sections` and not from processing chunk count.

- [ ] **Step 2: Run the contract fixture and verify failure**

  Run the targeted fixture. Expected: FAIL because the current prepared modal only reports generic processing metadata.

- [ ] **Step 3: Implement the summary**

  Add a pure local formatter in `App.tsx` or a focused helper: count sections with meaningful text, use `chapters detected` only when more than one section exists, and use `1 reading section` for the fallback. Add it to the existing prepared metadata row without changing the Play/Review actions.

- [ ] **Step 4: Run the fixture and TypeScript check**

  Run the targeted fixture and `npx tsc --noEmit`.

- [ ] **Step 5: Commit the import-surface change**

  Run: `git add App.tsx src/lib/strings.ts src/lib/*test.ts && git commit -m "feat: show detected chapters after import"`, restricting the staged test list to files actually changed by this task.

### Task 4: Make chapter navigation visually clear and state-aware

**Files:**
- Modify: `App.tsx`
- Modify: `src/lib/documentNavigation.ts` only if active-state/duration mapping needs a pure helper.

**Interfaces:**
- Consumes the existing `player.item`, `documentChapters`, `player.chapterTitle`, `player.jumpToChunk`, and `jumpToSection` callbacks.
- Produces a chapter list in the existing Bookmarks modal with active state, ordered labels, word-count context, and safe one-tap navigation.

- [ ] **Step 1: Add a UI contract fixture**

  Extend the existing source contract fixture to require an accessible chapter/section navigator action, active chapter styling, and the existing jump callbacks. Keep the test source-based because the repository has no React Native renderer test dependency.

- [ ] **Step 2: Run the fixture and verify failure**

  Run the targeted fixture. Expected: FAIL because the current list has generic jump rows and no active chapter state or explicit chapter affordance.

- [ ] **Step 3: Implement the chapter navigator**

  Extend `BookmarksModal` with an “IN THIS DOCUMENT” chapter area: show the current chapter first as a subtle highlighted context, render numbered rows with title and word count, use `onJumpChapter` for chunked items and `onJumpSection` for inline items, close after selection, and leave saved sentences/notes below. Add accessibility labels and avoid making the sheet depend on chapter data when the item is still preparing.

- [ ] **Step 4: Add the current-chapter affordance to PlayerScreen**

  Use the existing reader-tools row to label the action `Chapters & bookmarks`, and show `player.chapterTitle` or the active section title in the player’s reading context. Keep all playback controls and speech state untouched.

- [ ] **Step 5: Run UI contracts and TypeScript check**

  Run the targeted popup/source contracts plus `npx tsc --noEmit`.

- [ ] **Step 6: Commit the navigation change**

  Run: `git add App.tsx src/lib/documentNavigation.ts src/lib/*test.ts && git commit -m "feat: add intuitive chapter navigation"`, restricting the staged test list to files actually changed by this task.

### Task 5: Full verification and handoff

**Files:**
- Modify: only files needed to correct verified failures.

- [ ] **Step 1: Run all repository fixture tests**

  Run the project’s available test entry points, including every `src/**/*.test.ts` fixture through the local TypeScript runtime. Record any pre-existing failures separately from chapter-related failures.

- [ ] **Step 2: Run `npx tsc --noEmit`**

  Expected: exit code 0 with no chapter-related type errors.

- [ ] **Step 3: Inspect the final diff**

  Run: `git diff --stat` and `git diff -- src/lib/chapterDetection.ts src/lib/documents.ts src/lib/largeDocuments.ts App.tsx`. Confirm no unrelated dirty-worktree files were staged or rewritten.

- [ ] **Step 4: Report evidence and limitations**

  Report the exact test/typecheck results, note that the current library was intentionally not rescanned, and note that image-only PDFs still require the existing OCR path.
