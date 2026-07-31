import { unzipSync, unzlibSync, strFromU8 } from 'fflate';
import { File } from 'expo-file-system';
import { cleanText, htmlToText } from './text';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;

export type ImportedDocument = { text: string; title?: string; format: string };

function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function xmlText(xml: string) {
  return cleanText(decodeEntities(xml
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:br\b[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n\n')
    .replace(/<\/w:tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')));
}

function pathFrom(base: string, relative: string) {
  const parts = `${base}/${relative}`.split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') normalized.pop(); else normalized.push(part);
  }
  return normalized.join('/');
}

function readZip(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const total = Object.values(entries).reduce((size, entry) => size + entry.length, 0);
  if (total > MAX_UNPACKED_BYTES) throw new Error('This document expands to an unsafe size.');
  return entries;
}

function extractDocx(bytes: Uint8Array): ImportedDocument {
  const entries = readZip(bytes);
  const document = entries['word/document.xml'];
  if (!document) throw new Error('This Word document has no readable text.');
  const metadata = entries['docProps/core.xml'] ? strFromU8(entries['docProps/core.xml']) : '';
  const title = metadata.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1];
  return { text: xmlText(strFromU8(document)), title: title ? decodeEntities(title.trim()) : undefined, format: 'Word document' };
}

function extractEpub(bytes: Uint8Array): ImportedDocument {
  const entries = readZip(bytes);
  const container = entries['META-INF/container.xml'];
  if (!container) throw new Error('This EPUB is missing its book structure.');
  const rootPath = strFromU8(container).match(/full-path=["']([^"']+)["']/i)?.[1];
  if (!rootPath || !entries[rootPath]) throw new Error('This EPUB has no readable package.');
  const opf = strFromU8(entries[rootPath]);
  const root = rootPath.split('/').slice(0, -1).join('/');
  const title = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1];
  const manifest = new Map<string, string>();
  for (const match of opf.matchAll(/<item\b[^>]*\bid=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) manifest.set(match[1], match[2]);
  const spine = Array.from(opf.matchAll(/<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi)).map((match) => match[1]);
  const files = spine.map((id) => manifest.get(id)).filter((href): href is string => Boolean(href));
  const chapters = files.map((href) => entries[pathFrom(root, href)]).filter(Boolean).map((entry) => htmlToText(strFromU8(entry)));
  if (!chapters.length) throw new Error('This EPUB has no readable chapters.');
  return { text: cleanText(chapters.join('\n\n')), title: title ? decodeEntities(title.trim()) : undefined, format: 'EPUB' };
}

function decodePdfString(value: string) {
  return value.replace(/\\([()\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function pdfOperators(source: string) {
  const chunks: string[] = [];
  for (const match of source.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) chunks.push(decodePdfString(match[0].replace(/\s*Tj$/, '').slice(1, -1)));
  for (const match of source.matchAll(/\[(.*?)\]\s*TJ/gs)) for (const value of match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)) chunks.push(decodePdfString(value[0].slice(1, -1)));
  return chunks.join(' ');
}

function extractPdf(bytes: Uint8Array): ImportedDocument {
  // Extract standard text operators, including common Flate-compressed content streams.
  // PDFs with custom character maps, passwords, or image-only pages deliberately fail safely.
  const raw = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  if (/\/Encrypt\b/.test(raw)) throw new Error('This PDF is password protected.');
  const candidates = [raw];
  for (const match of raw.matchAll(/\/FlateDecode[\s\S]{0,800}?stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      candidates.push(strFromU8(unzlibSync(Uint8Array.from(match[1], (character) => character.charCodeAt(0)))));
    } catch { /* this stream may use an unsupported PDF filter */ }
  }
  const text = cleanText(candidates.map(pdfOperators).join('\n'));
  if (text.length < 20) throw new Error('This PDF appears to contain scanned images or unsupported text encoding.');
  return { text, format: 'PDF' };
}

function extractRtf(source: string): ImportedDocument {
  const text = cleanText(source
    .replace(/\\par[d]?\b/g, '\n\n').replace(/\\line\b/g, '\n').replace(/\\tab\b/g, '\t')
    .replace(/\\'[0-9a-f]{2}/gi, ' ').replace(/\\u-?\d+\??/gi, ' ')
    .replace(/\\[a-z]+-?\d*\s?/gi, '').replace(/[{}]/g, ''));
  if (!text) throw new Error('This RTF has no readable text.');
  return { text, format: 'Rich Text' };
}

export async function importDocument(uri: string, name: string, size?: number): Promise<ImportedDocument> {
  if (size && size > MAX_FILE_BYTES) throw new Error('This file is larger than 25 MB.');
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const file = new File(uri);
  const bytes = await file.bytes();
  if (bytes.length > MAX_FILE_BYTES) throw new Error('This file is larger than 25 MB.');
  if (extension === 'txt') return { text: cleanText(await file.text()), format: 'Text file' };
  if (extension === 'md' || extension === 'markdown') return { text: cleanText((await file.text()).replace(/^#{1,6}\s+/gm, '').replace(/[*_`>#]/g, '')), format: 'Markdown' };
  if (extension === 'html' || extension === 'htm') return { text: htmlToText(await file.text()), format: 'HTML' };
  if (extension === 'rtf') return extractRtf(await file.text());
  if (extension === 'docx') return extractDocx(bytes);
  if (extension === 'epub') return extractEpub(bytes);
  if (extension === 'pdf') return extractPdf(bytes);
  throw new Error('This file type is not supported.');
}
