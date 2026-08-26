import { Directory, File, Paths } from 'expo-file-system';
import { appendDocumentChunks, getLargeDocumentInfo, listResumableLargeDocuments, saveLargeDocumentInfo } from './database';
import { DocumentImportError, importDocument, MAX_EXTRACTABLE_DOCUMENT_BYTES } from './importers';
import type { ImportedDocument } from './importers';
import { countWords, safePublicRedirectUrl, safePublicUrl } from './text';
import { classifyDocumentLength, estimateDocumentPages } from './documentMetrics';
import { SUPPORTED_DOCUMENT_EXTENSIONS } from './importCapabilities';
import { assertExtractableDocumentSize, makeDetectedTextChunks, makePersistentChunks, makeSectionedPersistentChunks, processingStatusAfterFinalBatch } from './largeDocumentChunking';
import type { LargeDocumentInfo, LargeDocumentStatus } from '../types';

/** Keeps the ordinary import path fast while moving book-sized work out of library_items. */
export const LARGE_DOCUMENT_FILE_THRESHOLD = 1 * 1024 * 1024;
export const LARGE_DOCUMENT_TEXT_THRESHOLD = 250_000;
const STREAM_YIELD_EVERY = 5;
const MANAGED_DIRECTORY_NAME = 'soundoc-documents';

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
  return (SUPPORTED_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension(name));
}

export function shouldUseChunkedText(text: string) {
  // Classification is intentionally internal; it selects the durable path before a long draft can
  // make the inline player or library row carry book-sized text.
  return text.length >= LARGE_DOCUMENT_TEXT_THRESHOLD || ['long', 'veryLong'].includes(classifyDocumentLength({ wordCount: countWords(text) }));
}

/** Keep source chapter boundaries when a format provides them (notably EPUB spine order). */
function makeImportedDocumentChunks(imported: ImportedDocument, documentId: string, format: string) {
  const sections = imported.sections?.filter((section) => countWords(section.text) > 0);
  if (!sections?.length) return makeDetectedTextChunks(imported.text, documentId, format, imported.title);
  return makeSectionedPersistentChunks(sections, documentId, format);
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
  const file = new File(info.sourceUri);
  let next = { ...info, status: info.processedUnits ? 'partiallyReady' : 'processing', errorMessage: undefined } as LargeDocumentInfo;
  notify(next, listener);
  try {
    assertExtractableDocumentSize(file.size);
    const text = await file.text();
    const built = makeDetectedTextChunks(text, info.documentId, formatFor(info.originalFileName), info.originalFileName);
    const pendingChunks = built.chunks.filter((chunk) => chunk.sequence >= info.processedUnits);
    for (let index = 0; index < pendingChunks.length; index += STREAM_YIELD_EVERY) {
      if (pauseRequested(info.documentId)) { notify(updated(next, { status: 'paused' }), listener); return; }
      const batch = pendingChunks.slice(index, index + STREAM_YIELD_EVERY);
      appendDocumentChunks(info.documentId, batch);
      const processedUnits = batch[batch.length - 1].sequence + 1;
      const processedChunks = built.chunks.slice(0, processedUnits);
      const wordCount = processedChunks.reduce((total, chunk) => total + chunk.wordCount, 0);
      next = updated(next, { status: 'partiallyReady', processedUnits, totalUnits: built.state.sequence, processedBytes: Math.round(file.size * (processedUnits / built.state.sequence)), totalBytes: file.size, wordCount, estimatedDurationSeconds: processedChunks.reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0) });
      notify(next, listener);
      await yieldToUi();
    }
    if (processingStatusAfterFinalBatch(pauseRequested(info.documentId)) === 'paused') { notify(updated(next, { status: 'paused' }), listener); return; }
    const wordCount = built.chunks.reduce((total, chunk) => total + chunk.wordCount, 0);
    if (!wordCount) throw new Error('This text file has no readable text.');
    notify(updated(next, { status: 'ready', processedUnits: built.state.sequence, totalUnits: built.state.sequence, processedBytes: file.size, totalBytes: file.size, wordCount, estimatedDurationSeconds: built.chunks.reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0), pageCount: next.pageCount ?? estimateDocumentPages(wordCount) }), listener);
  } finally { /* Keep the same safe file ownership behavior; no stream lock remains after full-file text read. */ }
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
    const pendingChunks = built.chunks.filter((chunk) => chunk.sequence >= info.processedUnits);
    for (let index = 0; index < pendingChunks.length; index += STREAM_YIELD_EVERY) {
      if (pauseRequested(info.documentId)) { notify(updated(info, { status: 'paused' }), listener); return; }
      const batch = pendingChunks.slice(index, index + STREAM_YIELD_EVERY);
      appendDocumentChunks(info.documentId, batch);
      const processedUnits = batch[batch.length - 1].sequence + 1;
      const processedDuration = built.chunks.slice(0, processedUnits).reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0);
      notify(updated(info, { status: 'partiallyReady', processedUnits, totalUnits: state.sequence, processedBytes: Math.round(file.size * (processedUnits / state.sequence)), totalBytes: file.size, wordCount: built.chunks.slice(0, processedUnits).reduce((total, chunk) => total + chunk.wordCount, 0), estimatedDurationSeconds: processedDuration, pageCount: info.pageCount ?? imported.pageCount ?? estimateDocumentPages(wordCount), errorMessage: undefined }), listener);
      await yieldToUi();
    }
    if (processingStatusAfterFinalBatch(pauseRequested(info.documentId)) === 'paused') { notify(updated(info, { status: 'paused' }), listener); return; }
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
  activeDocumentId = documentId;
  try {
    if (pauseRequests.has(documentId)) { notify(updated(info, { status: 'paused' }), listener); return; }
    if (info.originalFileName && isStreamableText(info.originalFileName)) await processStreamedText(info, listener); else await processExtractedDocument(info, listener);
  }
  catch (error) { const current = getLargeDocumentInfo(documentId) ?? info; notify(updated(current, { status: 'failed', errorMessage: safeDocumentError(error, 'Soundoc could not finish preparing this document.') }), listener); }
  finally { if (activeDocumentId === documentId) { activeDocumentId = null; void advanceProcessingQueue(listener); } }
}

export function resumeLargeDocumentProcessing(documentId: string, listener?: ProcessorListener) {
  pauseRequests.delete(documentId);
  return processLargeDocument(documentId, listener);
}

export async function processLargeText(documentId: string, text: string, listener?: ProcessorListener) {
  let info = getLargeDocumentInfo(documentId); if (!info || ['ready', 'failed'].includes(info.status)) return;
  if (activeDocumentId && activeDocumentId !== documentId) { notify(updated(info, { status: 'queued' }), listener); return; }
  activeDocumentId = documentId;
  try {
    const built = makeDetectedTextChunks(text, documentId);
    const initialProcessedUnits = info.processedUnits;
    const pendingChunks = built.chunks.filter((chunk) => chunk.sequence >= initialProcessedUnits);
    for (let index = 0; index < pendingChunks.length; index += STREAM_YIELD_EVERY) {
      if (pauseRequested(documentId)) { notify(updated(info, { status: 'paused' }), listener); return; }
      const batch = pendingChunks.slice(index, index + STREAM_YIELD_EVERY);
      appendDocumentChunks(documentId, batch);
      const processedUnits = batch[batch.length - 1].sequence + 1;
      const processedChunks = built.chunks.slice(0, processedUnits);
      info = updated(info, { status: 'partiallyReady', processedUnits, totalUnits: built.state.sequence, processedBytes: Math.round(text.length * (processedUnits / built.state.sequence)), totalBytes: text.length, wordCount: processedChunks.reduce((total, chunk) => total + chunk.wordCount, 0), estimatedDurationSeconds: processedChunks.reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0) });
      notify(info, listener); await yieldToUi();
    }
    if (processingStatusAfterFinalBatch(pauseRequested(documentId)) === 'paused') { notify(updated(info, { status: 'paused' }), listener); return; }
    const wordCount = built.chunks.reduce((total, chunk) => total + chunk.wordCount, 0);
    notify(updated(info, { status: 'ready', processedUnits: built.state.sequence, totalUnits: built.state.sequence, processedBytes: text.length, totalBytes: text.length, wordCount, estimatedDurationSeconds: built.chunks.reduce((total, chunk) => total + chunk.estimatedDurationSeconds, 0), pageCount: info.pageCount ?? estimateDocumentPages(wordCount) }), listener);
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
export { findChapterHeading, makePersistentChunks } from './largeDocumentChunking';
