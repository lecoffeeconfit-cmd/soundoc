import { MAX_EXTRACTABLE_DOCUMENT_BYTES } from './importCapabilities';
import { assertExtractableDocumentSize, makeDetectedTextChunks, makeSectionedPersistentChunks, processingStatusAfterFinalBatch, uniqueChaptersFromChunks } from './largeDocumentChunking';
import type { SoundocSection } from '../types';

declare const require: (moduleName: string) => unknown;
declare const process: { cwd(): string };
const { readFileSync } = require('node:fs') as { readFileSync(path: string, encoding: 'utf8'): string };
const { resolve } = require('node:path') as { resolve(...paths: string[]): string };

function repeatedWords(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index}`).join(' ');
}

export function runLargeDocumentChapterFixtures() {
  const canonicalSections: SoundocSection[] = [
    { id: 'detected-opening', title: 'Detected Opening', text: `Chapter 1\n${repeatedWords('opening', 2600)}`, order: 0 },
    { id: 'detected-second', title: 'Detected Second', text: `Chapter 2\n${repeatedWords('second', 400)}`, order: 1 },
  ];
  const chunks = makeSectionedPersistentChunks(canonicalSections, 'canonical-book', 'Text file').chunks;
  const firstSectionChunks = chunks.filter((chunk) => chunk.sequence < chunks.length - 1);
  if (firstSectionChunks.length < 2) throw new Error('Fixture must split the first canonical section into multiple chunks');
  if (firstSectionChunks.some((chunk) => chunk.sectionId !== 'detected-opening' || chunk.sectionTitle !== 'Detected Opening')) throw new Error('Split chunks from a canonical section must keep that section ID/title');
  const finalChunk = chunks[chunks.length - 1];
  if (finalChunk?.sectionId !== 'detected-second' || finalChunk.sectionTitle !== 'Detected Second') throw new Error('Later chunks must keep the later canonical section ID/title');
  const chapters = uniqueChaptersFromChunks(chunks);
  if (chapters.length !== 2 || chapters[0]?.id !== 'detected-opening' || chapters[1]?.id !== 'detected-second') throw new Error('Chapter list must contain one row per canonical section, not one per chunk boundary');

  const markdown = `# Markdown One\n${repeatedWords('markdown-one', 2600)}\n\n# Markdown Two\n${repeatedWords('markdown-two', 400)}`;
  const markdownChunks = makeDetectedTextChunks(markdown, 'markdown-book', 'Markdown', 'Markdown Book').chunks;
  const markdownChapters = uniqueChaptersFromChunks(markdownChunks);
  if (markdownChapters.length !== 2 || markdownChapters[0]?.title !== 'Markdown One' || markdownChapters[1]?.title !== 'Markdown Two') throw new Error('Markdown long imports must use detector-backed sections before stripping heading markers');
  const markdownSingle = makeDetectedTextChunks('# Opening\n\nBody text.', 'markdown-single', 'Markdown', 'Markdown Book').chunks[0];
  if (!markdownSingle || markdownSingle.text.split(/\s+/).slice(0, 2).join(' ') === 'Opening Opening') throw new Error('Markdown headings must not be duplicated when persisted for playback');

  const suggestedText = Array.from({ length: 48 }, (_, index) => `Topic group ${index < 16 ? 'one' : index < 32 ? 'two' : 'three'} develops a connected idea with enough supporting detail for a reliable navigation preview. This paragraph explains the point in plain language and keeps the original wording intact for playback. Example ${index} adds a little more context for the listener.`).join('\n\n');
  const suggestedChunks = makeDetectedTextChunks(suggestedText, 'suggested-book', 'Text file', 'Suggested Book').chunks;
  if (!suggestedChunks.some((chunk) => chunk.sectionId?.startsWith('suggested-section-'))) throw new Error('Long unstructured imports should persist suggested section boundaries');
  if (suggestedChunks.some((chunk) => chunk.text.startsWith('Suggested section '))) throw new Error('Suggested labels must not be inserted into the spoken source text');

  assertExtractableDocumentSize(MAX_EXTRACTABLE_DOCUMENT_BYTES);
  let oversizedError: unknown;
  try { assertExtractableDocumentSize(MAX_EXTRACTABLE_DOCUMENT_BYTES + 1); } catch (error) { oversizedError = error; }
  if (!(oversizedError instanceof Error) || oversizedError.message !== 'This document is too large to prepare safely on this device.') throw new Error('Oversized streamed text must fail with the safe document-size error');

  if (processingStatusAfterFinalBatch(true) !== 'paused' || processingStatusAfterFinalBatch(false) !== 'ready') throw new Error('A pause requested after the final batch must win over ready status');

  const source = readFileSync(resolve(process.cwd(), 'src/lib/largeDocuments.ts'), 'utf8');
  const extractedStart = source.indexOf('async function processExtractedDocument');
  const extractedEnd = source.indexOf('export async function processLargeDocument');
  if (extractedStart < 0 || extractedEnd < 0 || !source.slice(extractedStart, extractedEnd).includes('processingStatusAfterFinalBatch(pauseRequested(info.documentId))')) throw new Error('Extracted document processing must honor a final pause before ready');
  if (!source.slice(extractedStart, extractedEnd).includes('built.chunks.filter((chunk) => chunk.sequence >= info.processedUnits)')) throw new Error('Extracted document processing must resume from the persisted sequence');
  if (!source.includes('pauseRequests.has(documentId)')) throw new Error('Queued pause requests must be checked before they are cleared');
}

runLargeDocumentChapterFixtures();
