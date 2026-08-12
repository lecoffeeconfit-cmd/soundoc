import { Directory, File, Paths } from 'expo-file-system';
import { appendDocumentChunks, getLargeDocumentInfo, listResumableLargeDocuments, saveLargeDocumentInfo } from './database';
import { DocumentImportError, importDocument, MAX_EXTRACTABLE_DOCUMENT_BYTES } from './importers';
import type { ImportedDocument } from './importers';
import { cleanText, countWords, estimateSeconds, htmlToText, safePublicRedirectUrl, safePublicUrl } from './text';
import { classifyDocumentLength, estimateDocumentPages } from './documentMetrics';
import type { DocumentTextChunk, LargeDocumentInfo, LargeDocumentStatus } from '../types';

/** Keeps the ordinary import path fast while moving book-sized work out of library_items. */
export const LARGE_DOCUMENT_FILE_THRESHOLD = 1 * 1024 * 1024;
export const LARGE_DOCUMENT_TEXT_THRESHOLD = 250_000;
const PERSISTED_CHUNK_TARGET = 14_000;
const PERSISTED_CHUNK_MAX = 18_000;
const STREAM_YIELD_EVERY = 5;
const MANAGED_DIRECTORY_NAME = 'soundoc-documents';

type ChunkBuildState = { sequence: number; sectionNumber: number; sectionId?: string; sectionTitle?: string; sourceOffset: number };
type ProcessorListener = (info: LargeDocumentInfo) => void;

let activeDocumentId: string | null = null;
const pauseRequests = new Set<string>();

function extension(name: string) { return name.split('.').pop()?.toLowerCase() ?? ''; }
function isStreamableText(name: string) { return ['txt', 'md', 'markdown'].includes(extension(name)); }
function formatFor(name: string) {
  const value = extension(name);
  if (value === 'txt') return 'Text file'; if (value === 'md' || value === 'markdown') return 'Markdown';
  if (value === 'pdf') return 'PDF'; if (value === 'docx') return 'Word document'; if (value === 'epub') return 'EPUB';
  if (value === 'html' || value === 'htm') return 'HTML'; if (value === 'rtf') return 'Rich Text'; return 'Document';
}

export function shouldUseChunkedDocument(name: string, size?: number) {
  // Document imports always use the persistent path. This keeps small reports and long books on
  // the same resume-safe player pipeline, while file-specific extraction remains source-specific.
  return ['txt', 'md', 'markdown', 'html', 'htm', 'rtf', 'pdf', 'docx', 'epub'].includes(extension(name));
}

export function shouldUseChunkedText(text: string) {
  // Classification is intentionally internal; it selects the durable path before a long draft can
  // make the inline player or library row carry book-sized text.
  return text.length >= LARGE_DOCUMENT_TEXT_THRESHOLD || ['long', 'veryLong'].includes(classifyDocumentLength({ wordCount: countWords(text) }));
}

export function findChapterHeading(text: string) {
  const firstLine = cleanText(text).split('\n').map((line) => line.trim()).find(Boolean);
  if (!firstLine || firstLine.length > 120) return undefined;
  if (/^(?:chapter|part|section)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(firstLine)
    || /^(?:introduction|preface|prologue|epilogue|conclusion|appendix|afterword)\b/i.test(firstLine)
    || /^\d+(?:\.\d+){0,3}\s+[A-Z]/.test(firstLine)
    || (firstLine === firstLine.toUpperCase() && firstLine.split(/\s+/).length <= 10 && !/[.!?]$/.test(firstLine))) return firstLine.replace(/^#+\s*/, '');
  return undefined;
}

function normalizeChunkText(text: string, format: string) {
  if (format === 'Markdown') return cleanText(text.replace(/^#{1,6}\s+/gm, '').replace(/[*_`>#]/g, ''));
  if (format === 'HTML') return htmlToText(text);
  return cleanText(text);
}

function splitAtNaturalBoundary(text: string, maximum: number) {
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
export function makePersistentChunks(text: string, documentId: string, state: ChunkBuildState, format = 'Text file'): { chunks: DocumentTextChunk[]; state: ChunkBuildState } {
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
    const heading = findChapterHeading(value);
    if (heading) { nextState.sectionNumber += 1; nextState.sectionId = `chapter-${nextState.sectionNumber}`; nextState.sectionTitle = heading; }
    const wordCount = countWords(value); if (!wordCount) return;
    const sourceStart = nextState.sourceOffset; nextState.sourceOffset += value.length;
    chunks.push({ id: `${documentId}-chunk-${nextState.sequence}`, documentId, sequence: nextState.sequence, text: value, wordCount, estimatedDurationSeconds: estimateSeconds(wordCount), sectionId: nextState.sectionId, sectionTitle: nextState.sectionTitle, sourceStart, sourceEnd: nextState.sourceOffset });
    nextState.sequence += 1;
  });
  return { chunks, state: nextState };
}

/** Keep source chapter boundaries when a format provides them (notably EPUB spine order). */
function makeImportedDocumentChunks(imported: ImportedDocument, documentId: string, format: string) {
  const sections = imported.sections?.filter((section) => countWords(section.text) > 0);
  if (!sections?.length) return makePersistentChunks(imported.text, documentId, { sequence: 0, sectionNumber: 0, sourceOffset: 0 }, format);
  let state: ChunkBuildState = { sequence: 0, sectionNumber: 0, sourceOffset: 0 };
  const chunks: DocumentTextChunk[] = [];
  sections.forEach((section, index) => {
    state = { ...state, sectionNumber: state.sectionNumber + 1, sectionId: section.id || `chapter-${index + 1}`, sectionTitle: section.title || `Section ${index + 1}` };
    const sectionText = section.title && !section.text.trimStart().startsWith(section.title) ? `${section.title}\n\n${section.text}` : section.text;
    const built = makePersistentChunks(sectionText, documentId, state, format);
    chunks.push(...built.chunks); state = built.state;
  });
  return { chunks, state };
}

function notify(info: LargeDocumentInfo, listener?: ProcessorListener) { saveLargeDocumentInfo(info); listener?.(info); }
function pauseRequested(documentId: string) { return pauseRequests.has(documentId); }
function yieldToUi() { return new Promise<void>((resolve) => setTimeout(resolve, 0)); }

const SAFE_DOCUMENT_ERROR_PATTERNS = [
  /^There is not enough free storage to (?:keep a safe local copy of|download) this document\.$/,
  /^Soundoc could not (?:access the selected file|download this document|safely process this document|finish preparing this (?:document|text))\.$/,
  /^This (?:document is too large to prepare safely on this device|link is not supported|link has too many redirects|text file has no readable text|document has no readable text|Word document has no readable text|EPUB (?:is missing its book structure|has no readable (?:package|chapters))|PDF is password protected|file (?:does not look like a readable PDF|does not look like readable RTF text|is too large to read safely on this device|type is not supported)|RTF has no readable text)\.$/,
  /^The original (?:text file|file) is unavailable\.$/,
];

/** Keeps parser, archive, and filesystem internals out of user-facing import errors. */
export function safeDocumentError(error: unknown, fallback = 'Soundoc could not safely process this document.') {
  const message = error instanceof Error ? error.message.trim() : '';
  return SAFE_DOCUMENT_ERROR_PATTERNS.some((pattern) => pattern.test(message)) ? message : fallback;
}

function safeFileName(name: string) { return name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'document'; }
function managedDirectory() { const directory = new Directory(Paths.document, MANAGED_DIRECTORY_NAME); directory.create({ idempotent: true, intermediates: true }); return directory; }
function isWithinDirectory(uri: string | undefined, directory: Directory) {
  const root = directory.uri.replace(/\/+$/, '') + '/';
  return Boolean(uri && uri.startsWith(root));
}
function isManagedDocumentUri(uri?: string) {
  return isWithinDirectory(uri, new Directory(Paths.document, MANAGED_DIRECTORY_NAME));
}
function isTemporaryCacheUri(uri?: string) {
  return isWithinDirectory(uri, Paths.cache);
}

export async function copyLargeDocumentToManagedStorage(documentId: string, uri: string, name: string, size?: number) {
  if (size && Paths.availableDiskSpace > 0 && Paths.availableDiskSpace < size + Math.max(20 * 1024 * 1024, Math.ceil(size * 0.15))) throw new Error('There is not enough free storage to keep a safe local copy of this document.');
  const source = new File(uri); if (!source.exists) throw new Error('Soundoc could not access the selected file.');
  const destination = new File(managedDirectory(), `${documentId}-${safeFileName(name)}`);
  try {
    await source.copy(destination);
    // DocumentPicker may provide a temporary cache copy. Remove only that
    // app-owned copy; never delete a provider-owned or user-selected original.
    if (isTemporaryCacheUri(uri) && source.exists) source.delete();
    return destination.uri;
  } catch (error) {
    if (destination.exists) destination.delete();
    if (isTemporaryCacheUri(uri) && source.exists) source.delete();
    throw error;
  }
}

/** Downloads a public file directly into Soundoc-managed storage without loading it into JS memory. */
export async function downloadRemoteDocumentToManagedStorage(documentId: string, url: string, name: string, expectedSize?: number) {
  if (expectedSize && expectedSize > MAX_EXTRACTABLE_DOCUMENT_BYTES) throw new Error('This document is too large to prepare safely on this device.');
  if (expectedSize && Paths.availableDiskSpace > 0 && Paths.availableDiskSpace < expectedSize + Math.max(20 * 1024 * 1024, Math.ceil(expectedSize * 0.15))) throw new Error('There is not enough free storage to download this document safely.');
  const initialUrl = safePublicUrl(url);
  if (!initialUrl) throw new Error('This link is not supported.');
  const destination = new File(managedDirectory(), `${documentId}-${safeFileName(name)}`);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  try {
    let currentUrl = initialUrl;
    let response: Response | undefined;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      response = await fetch(currentUrl.toString(), { redirect: 'manual' });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const nextUrl = safePublicRedirectUrl(currentUrl, response.headers.get('location'));
      if (!nextUrl) throw new Error('This link is not supported.');
      currentUrl = nextUrl;
    }
    if (!response || [301, 302, 303, 307, 308].includes(response.status)) throw new Error('This link has too many redirects.');
    if (!response.ok) throw new Error('Soundoc could not download this document.');
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_EXTRACTABLE_DOCUMENT_BYTES) throw new Error('This document is too large to prepare safely on this device.');
    if (!response.body) throw new Error('Soundoc could not download this document.');
    destination.create({ overwrite: true, intermediates: true });
    reader = response.body.getReader();
    writer = destination.writableStream().getWriter();
    let downloadedBytes = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      downloadedBytes += result.value.byteLength;
      if (downloadedBytes > MAX_EXTRACTABLE_DOCUMENT_BYTES) throw new Error('This document is too large to prepare safely on this device.');
      await writer.write(result.value);
    }
    await writer.close();
    writer = undefined;
    if (new File(destination).size > MAX_EXTRACTABLE_DOCUMENT_BYTES) throw new Error('This document is too large to prepare safely on this device.');
    return destination.uri;
  } catch (error) {
    try { await writer?.abort(error); } catch { /* Best-effort cleanup before removing the partial file. */ }
    try { await reader?.cancel(); } catch { /* Best-effort cleanup before removing the partial file. */ }
    if (destination.exists) destination.delete();
    throw error;
  }
}

export function saveLargeTextToManagedStorage(documentId: string, text: string) {
  const destination = new File(managedDirectory(), `${documentId}-pasted-text.txt`);
  destination.create({ overwrite: true, intermediates: true });
  destination.write(text);
  return destination.uri;
}

export function deleteManagedDocumentFile(uri?: string) {
  if (!isManagedDocumentUri(uri)) return;
  const file = new File(uri!); if (file.exists) file.delete();
}

export function createLargeDocumentInfo(input: { documentId: string; originalFileName?: string; sourceUri?: string; format: string; mimeType?: string; fileSize?: number; pageCount?: number; status?: LargeDocumentStatus }): LargeDocumentInfo {
  const now = Date.now();
  return { documentId: input.documentId, originalFileName: input.originalFileName, sourceUri: input.sourceUri, format: input.format, mimeType: input.mimeType, fileSize: input.fileSize, pageCount: input.pageCount, status: input.status ?? 'queued', processedUnits: 0, processedBytes: 0, totalBytes: input.fileSize, wordCount: 0, estimatedDurationSeconds: 0, createdAt: now, updatedAt: now };
}

function updated(info: LargeDocumentInfo, patch: Partial<LargeDocumentInfo>) { return { ...info, ...patch, updatedAt: Date.now() }; }

async function processStreamedText(info: LargeDocumentInfo, listener?: ProcessorListener) {
  if (!info.sourceUri || !info.originalFileName) throw new Error('The original text file is unavailable.');
  const file = new File(info.sourceUri); const stream = file.slice(info.processedBytes).stream(); const reader = stream.getReader(); const decoder = new TextDecoder();
  let next = { ...info, status: info.processedUnits ? 'partiallyReady' : 'processing', errorMessage: undefined } as LargeDocumentInfo;
  let state: ChunkBuildState = { sequence: info.processedUnits, sectionNumber: 0, sourceOffset: info.processedBytes };
  let batches = 0;
  try {
    while (true) {
      if (pauseRequested(info.documentId)) { notify(updated(next, { status: 'paused' }), listener); return; }
      const result = await reader.read(); if (result.done) break;
      const text = decoder.decode(result.value, { stream: true });
      const built = makePersistentChunks(text, info.documentId, state, formatFor(info.originalFileName)); state = built.state;
      appendDocumentChunks(info.documentId, built.chunks);
      const words = built.chunks.reduce((total, chunk) => total + chunk.wordCount, 0);
      next = updated(next, { status: state.sequence ? 'partiallyReady' : 'processing', processedUnits: state.sequence, processedBytes: Math.min(file.size, next.processedBytes + result.value.byteLength), wordCount: next.wordCount + words, estimatedDurationSeconds: next.estimatedDurationSeconds + built.chunks.reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0) });
      notify(next, listener); batches += 1;
      if (batches % STREAM_YIELD_EVERY === 0) await yieldToUi();
    }
    const tail = decoder.decode(); if (tail) { const built = makePersistentChunks(tail, info.documentId, state, formatFor(info.originalFileName)); appendDocumentChunks(info.documentId, built.chunks); state = built.state; next = updated(next, { processedUnits: state.sequence, wordCount: next.wordCount + built.chunks.reduce((total, chunk) => total + chunk.wordCount, 0), estimatedDurationSeconds: next.estimatedDurationSeconds + built.chunks.reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0) }); }
    if (!next.wordCount) throw new Error('This text file has no readable text.');
    notify(updated(next, { status: 'ready', processedBytes: file.size, totalBytes: file.size, pageCount: next.pageCount ?? estimateDocumentPages(next.wordCount) }), listener);
  } finally { reader.releaseLock(); }
}

async function processExtractedDocument(info: LargeDocumentInfo, listener?: ProcessorListener) {
  if (!info.sourceUri || !info.originalFileName) throw new Error('The original file is unavailable.');
  const file = new File(info.sourceUri);
  notify(updated(info, { status: 'analyzing', errorMessage: undefined }), listener);
  try {
    const imported = await importDocument(info.sourceUri, info.originalFileName, file.size);
    const built = makeImportedDocumentChunks(imported, info.documentId, info.format);
    const state = built.state;
    const wordCount = built.chunks.reduce((total, chunk) => total + chunk.wordCount, 0);
    if (!wordCount) throw new Error('This document has no readable text.');
    const totalDuration = built.chunks.reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0);
    for (let index = 0; index < built.chunks.length; index += STREAM_YIELD_EVERY) {
      if (pauseRequested(info.documentId)) { notify(updated(info, { status: 'paused' }), listener); return; }
      const batch = built.chunks.slice(index, index + STREAM_YIELD_EVERY);
      appendDocumentChunks(info.documentId, batch);
      const processedUnits = batch[batch.length - 1].sequence + 1;
      const processedDuration = built.chunks.slice(0, processedUnits).reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0);
      notify(updated(info, { status: 'partiallyReady', processedUnits, totalUnits: state.sequence, processedBytes: Math.round(file.size * (processedUnits / state.sequence)), totalBytes: file.size, wordCount: built.chunks.slice(0, processedUnits).reduce((total, chunk) => total + chunk.wordCount, 0), estimatedDurationSeconds: processedDuration, pageCount: info.pageCount ?? imported.pageCount ?? estimateDocumentPages(wordCount), errorMessage: undefined }), listener);
      await yieldToUi();
    }
    notify(updated(info, { status: 'ready', processedUnits: state.sequence, totalUnits: state.sequence, processedBytes: file.size, totalBytes: file.size, wordCount, estimatedDurationSeconds: totalDuration, pageCount: info.pageCount ?? imported.pageCount ?? estimateDocumentPages(wordCount), errorMessage: undefined }), listener);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    const message = safeDocumentError(error, 'Soundoc could not read this document.');
    const scanned = extension(info.originalFileName) === 'pdf' && /scanned|unsupported text encoding/i.test(rawMessage);
    const pageCount = error instanceof DocumentImportError ? error.pageCount : info.pageCount;
    notify(updated(info, { status: scanned ? 'needsOCR' : 'failed', pageCount, errorMessage: scanned ? 'This PDF appears to contain scanned pages. OCR support is required before it can be read aloud.' : message }), listener);
  }
}

export async function processLargeDocument(documentId: string, listener?: ProcessorListener) {
  const info = getLargeDocumentInfo(documentId); if (!info || ['ready', 'needsOCR'].includes(info.status)) return;
  if (activeDocumentId && activeDocumentId !== documentId) { notify(updated(info, { status: 'queued' }), listener); return; }
  activeDocumentId = documentId; pauseRequests.delete(documentId);
  try { if (info.originalFileName && isStreamableText(info.originalFileName)) await processStreamedText(info, listener); else await processExtractedDocument(info, listener); }
  catch (error) { const current = getLargeDocumentInfo(documentId) ?? info; notify(updated(current, { status: 'failed', errorMessage: safeDocumentError(error, 'Soundoc could not finish preparing this document.') }), listener); }
  finally { if (activeDocumentId === documentId) { activeDocumentId = null; void advanceProcessingQueue(listener); } }
}

export async function processLargeText(documentId: string, text: string, listener?: ProcessorListener) {
  let info = getLargeDocumentInfo(documentId); if (!info || ['ready', 'failed'].includes(info.status)) return;
  if (activeDocumentId && activeDocumentId !== documentId) { notify(updated(info, { status: 'queued' }), listener); return; }
  activeDocumentId = documentId; pauseRequests.delete(documentId);
  try {
    let state: ChunkBuildState = { sequence: info.processedUnits, sectionNumber: 0, sourceOffset: 0 };
    const pieces = splitAtNaturalBoundary(text, PERSISTED_CHUNK_MAX);
    for (let index = 0; index < pieces.length; index += 1) {
      if (pauseRequested(documentId)) { notify(updated(info, { status: 'paused' }), listener); return; }
      const built = makePersistentChunks(pieces[index], documentId, state); state = built.state; appendDocumentChunks(documentId, built.chunks);
      info = updated(info, { status: state.sequence ? 'partiallyReady' : 'processing', processedUnits: state.sequence, totalUnits: pieces.length, processedBytes: Math.min(text.length, info.processedBytes + pieces[index].length), totalBytes: text.length, wordCount: info.wordCount + built.chunks.reduce((total, chunk) => total + chunk.wordCount, 0), estimatedDurationSeconds: info.estimatedDurationSeconds + built.chunks.reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0) });
      notify(info, listener); if (index % STREAM_YIELD_EVERY === 0) await yieldToUi();
    }
    notify(updated(info, { status: 'ready', processedUnits: state.sequence, totalUnits: state.sequence, processedBytes: text.length, totalBytes: text.length, pageCount: info.pageCount ?? estimateDocumentPages(info.wordCount) }), listener);
  } catch (error) { notify(updated(info, { status: 'failed', errorMessage: safeDocumentError(error, 'Soundoc could not finish preparing this text.') }), listener); }
  finally { if (activeDocumentId === documentId) { activeDocumentId = null; void advanceProcessingQueue(listener); } }
}

export function pauseLargeDocumentProcessing(documentId: string) { pauseRequests.add(documentId); }
async function advanceProcessingQueue(listener?: ProcessorListener) {
  if (activeDocumentId) return;
  const next = listResumableLargeDocuments()[0];
  if (next) await processLargeDocument(next.documentId, listener);
}
export async function resumePendingLargeDocuments(listener?: ProcessorListener) { await advanceProcessingQueue(listener); }
export { formatFor as largeDocumentFormatFor };
