import { sectionsFromText } from './documents';
import { MAX_EXTRACTABLE_DOCUMENT_BYTES } from './importCapabilities';
import { cleanText, countWords, estimateSeconds, htmlToText } from './text';
import type { DocumentChapter, DocumentTextChunk, SoundocSection } from '../types';

const PERSISTED_CHUNK_TARGET = 14_000;
const PERSISTED_CHUNK_MAX = 18_000;

export function assertExtractableDocumentSize(fileSize: number) {
  if (Number.isFinite(fileSize) && fileSize > MAX_EXTRACTABLE_DOCUMENT_BYTES) throw new Error('This document is too large to prepare safely on this device.');
}

export function processingStatusAfterFinalBatch(pauseWasRequested: boolean): 'paused' | 'ready' {
  return pauseWasRequested ? 'paused' : 'ready';
}

export type ChunkBuildState = { sequence: number; sectionNumber: number; sectionId?: string; sectionTitle?: string; sourceOffset: number };

export function findChapterHeading(text: string) {
  const firstLine = cleanText(text).split('\n').map((line) => line.trim()).find(Boolean);
  if (!firstLine || firstLine.length > 120) return undefined;
  if (/^(?:chapter|part|section)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(firstLine)
    || /^(?:introduction|preface|prologue|epilogue|conclusion|appendix|afterword)\b/i.test(firstLine)
    || /^\d+(?:\.\d+){0,3}\s+[A-Z]/.test(firstLine)
    || (firstLine === firstLine.toUpperCase() && firstLine.split(/\s+/).length <= 10 && !/[.!?]$/.test(firstLine))) return firstLine.replace(/^#+\s*/, '');
  return undefined;
}

export function normalizeChunkText(text: string, format: string) {
  if (format === 'Markdown') return cleanText(text.replace(/^#{1,6}\s+/gm, '').replace(/[*_`>#]/g, ''));
  if (format === 'HTML') return htmlToText(text);
  return cleanText(text);
}

export function splitAtNaturalBoundary(text: string, maximum: number) {
  if (text.length <= maximum) return [text];
  const chunks: string[] = []; let remaining = text;
  while (remaining.length > maximum) {
    const window = remaining.slice(0, maximum);
    const boundary = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '), window.lastIndexOf(' '));
    const index = boundary > Math.floor(maximum * 0.45) ? boundary + (remaining[boundary] === '\n' ? 1 : 0) : maximum;
    chunks.push(remaining.slice(0, index)); remaining = remaining.slice(index);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** Pure, bounded chunking used by both streamed files and already-extracted EPUB/PDF/DOCX text. */
export function makePersistentChunks(text: string, documentId: string, state: ChunkBuildState, format = 'Text file', options: { preserveSection?: boolean } = {}): { chunks: DocumentTextChunk[]; state: ChunkBuildState } {
  const normalized = normalizeChunkText(text, format);
  if (!normalized) return { chunks: [], state };
  const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const values: string[] = []; let buffer = '';
  paragraphs.forEach((paragraph) => {
    if (buffer && buffer.length + paragraph.length + 2 > PERSISTED_CHUNK_TARGET) { values.push(buffer); buffer = ''; }
    if (paragraph.length > PERSISTED_CHUNK_MAX) {
      if (buffer) { values.push(buffer); buffer = ''; }
      values.push(...splitAtNaturalBoundary(paragraph, PERSISTED_CHUNK_TARGET));
    } else buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  });
  if (buffer) values.push(buffer);
  const chunks: DocumentTextChunk[] = [];
  let nextState = { ...state };
  values.forEach((value) => {
    const heading = options.preserveSection ? undefined : findChapterHeading(value);
    if (heading) { nextState.sectionNumber += 1; nextState.sectionId = `chapter-${nextState.sectionNumber}`; nextState.sectionTitle = heading; }
    const wordCount = countWords(value); if (!wordCount) return;
    const sourceStart = nextState.sourceOffset; nextState.sourceOffset += value.length;
    chunks.push({ id: `${documentId}-chunk-${nextState.sequence}`, documentId, sequence: nextState.sequence, text: value, wordCount, estimatedDurationSeconds: estimateSeconds(wordCount), sectionId: nextState.sectionId, sectionTitle: nextState.sectionTitle, sourceStart, sourceEnd: nextState.sourceOffset });
    nextState.sequence += 1;
  });
  return { chunks, state: nextState };
}

export function makeSectionedPersistentChunks(sections: SoundocSection[], documentId: string, format: string) {
  let state: ChunkBuildState = { sequence: 0, sectionNumber: 0, sourceOffset: 0 };
  const chunks: DocumentTextChunk[] = [];
  sections.filter((section) => countWords(section.text) > 0).forEach((section, index) => {
    state = { ...state, sectionNumber: state.sectionNumber + 1, sectionId: section.id || `chapter-${index + 1}`, sectionTitle: section.title || `Section ${index + 1}` };
    const normalizedSectionText = normalizeChunkText(section.text, format);
    const sectionText = section.kind !== 'suggested' && section.title && !normalizedSectionText.trimStart().startsWith(section.title) ? `${section.title}\n\n${section.text}` : section.text;
    const built = makePersistentChunks(sectionText, documentId, state, format, { preserveSection: true });
    chunks.push(...built.chunks); state = built.state;
  });
  return { chunks, state };
}

export function makeDetectedTextChunks(text: string, documentId: string, format = 'Text file', title?: string) {
  const sections = sectionsFromText(text, title, { suggestSections: true }).filter((section) => countWords(section.text) > 0);
  return sections.length ? makeSectionedPersistentChunks(sections, documentId, format) : makePersistentChunks(text, documentId, { sequence: 0, sectionNumber: 0, sourceOffset: 0 }, format);
}

export function uniqueChaptersFromChunks(chunks: DocumentTextChunk[]): DocumentChapter[] {
  const seen = new Set<string>();
  const chapters: DocumentChapter[] = [];
  chunks.forEach((chunk) => {
    if (!chunk.sectionId || !chunk.sectionTitle) return;
    const key = `${chunk.sectionId}\n${chunk.sectionTitle}`;
    if (seen.has(key)) return;
    seen.add(key);
    chapters.push({ documentId: chunk.documentId, id: chunk.sectionId, title: chunk.sectionTitle, sequence: chunk.sequence });
  });
  return chapters;
}
