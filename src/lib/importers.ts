import { unzipSync, unzlibSync, strFromU8 } from 'fflate';
import { File } from 'expo-file-system';
import { cleanText, htmlToText, removeArticleReferenceNoise } from './text';
import { sectionsFromText } from './documents';
import type { SoundocSection, SoundocSourceType } from '../types';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;

export type ImportedDocument = { text: string; title?: string; format: string; sourceUrl?: string; sourceType?: SoundocSourceType; originalText?: string; sections?: SoundocSection[]; author?: string; extractionMethod?: string; extractionConfidence?: number; extractionWarnings?: string[] };
export type ArticleExtraction = ImportedDocument & { sourceDomain: string; authors: string[]; abstract?: string; confidence: number; suspicious: boolean; warnings: string[]; method: 'json-ld' | 'semantic' | 'readability' | 'fallback' };

function enrichImportedDocument(document: ImportedDocument, sourceType: SoundocSourceType, extractionMethod: string, originalText?: string): ImportedDocument {
  return { ...document, sourceType, sections: document.sections ?? sectionsFromText(document.text, document.title), extractionMethod, extractionConfidence: document.extractionConfidence ?? 1, extractionWarnings: document.extractionWarnings ?? [], ...(originalText === undefined ? {} : { originalText }) };
}

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
  if (extension === 'txt') { const originalText = await file.text(); return enrichImportedDocument({ text: cleanText(originalText), format: 'Text file', originalText }, 'text', 'plain-text', originalText); }
  if (extension === 'md' || extension === 'markdown') { const originalText = await file.text(); return enrichImportedDocument({ text: cleanText(originalText.replace(/^#{1,6}\s+/gm, '').replace(/[*_`>#]/g, '')), format: 'Markdown', originalText }, 'text', 'markdown', originalText); }
  if (extension === 'html' || extension === 'htm') { const originalText = await file.text(); const extraction = extractArticleFromHtml(originalText, 'https://soundoc.local/import.html'); return enrichImportedDocument({ text: extraction.text, title: extraction.title, format: 'HTML', sections: extraction.sections, extractionConfidence: extraction.confidence, extractionWarnings: extraction.warnings, originalText }, 'html', `html-${extraction.method}`, originalText); }
  if (extension === 'rtf') { const originalText = await file.text(); return enrichImportedDocument({ ...extractRtf(originalText), originalText }, 'text', 'rtf', originalText); }
  if (extension === 'docx') return enrichImportedDocument(extractDocx(bytes), 'docx', 'docx-xml');
  if (extension === 'epub') return enrichImportedDocument(extractEpub(bytes), 'epub', 'epub-spine');
  if (extension === 'pdf') return enrichImportedDocument(extractPdf(bytes), 'pdf', 'pdf-text');
  throw new Error('This file type is not supported.');
}

const boilerplatePattern = /(?:nav|navigation|header|footer|sidebar|side-bar|advert|ads|advertisement|promo|promotional|cookie|consent|share|social|related|recommended|citation|references?|download|publisher|collection|permalink|toolbar|breadcrumb|copyright|disclaimer|menu|toc|table[-_ ]of[-_ ]contents|login|subscribe|newsletter)/i;

function decodeHtml(value: string) {
  return decodeEntities(value).replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function removeBoilerplateBlocks(html: string) {
  let output = html.replace(/<!--[\s\S]*?-->/g, '');
  const blocked = '(?:nav|header|footer|aside|form|button|script|style|noscript|svg|iframe|dialog)';
  output = output.replace(new RegExp(`<${blocked}\\b[^>]*>[\\s\\S]*?<\\/[^>]+>`, 'gi'), ' ');
  output = output.replace(new RegExp(`<([a-z][\\w:-]*)\\b[^>]*(?:id|class|role)=["'][^"']*${boilerplatePattern.source}[^"']*["'][^>]*>[\\s\\S]*?<\\/\\1>`, 'gi'), ' ');
  return output;
}

function removePmcReferenceBlocks(html: string) {
  // PMC uses several generations of markup: ref-list, reference-list, and back matter.
  // Remove the containing list before text conversion so individual citation rows cannot
  // leak into the spoken article.
  return html.replace(/<(?:section|div|ol|ul|aside)\b[^>]*(?:id|class)=['"][^'"]*(?:ref[-_ ]?list|reference[-_ ]?list|references?|bibliography|back[-_ ]?matter)[^'"]*['"][^>]*>[\s\S]*?<\/(?:section|div|ol|ul|aside)>/gi, ' ');
}

function htmlFragmentToArticleText(fragment: string) {
  return cleanText(decodeHtml(removeBoilerplateBlocks(fragment)
    .replace(/<h[1-6][^>]*>/gi, '\n\n').replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<(?:p|div|section|article|li|tr|figcaption)[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|li|tr|figcaption)>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')));
}

function metaContent(html: string, key: string) {
  const match = html.match(new RegExp(`<meta[^>]*(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${key}["'][^>]*>`, 'i'));
  return match?.[1] ? decodeHtml(match[1]).trim() : undefined;
}

function structuredArticle(html: string) {
  const scripts = Array.from(html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const values: any[] = [];
  scripts.forEach((match) => { try { const parsed = JSON.parse(decodeHtml(match[1].trim())); values.push(...(Array.isArray(parsed) ? parsed : [parsed])); } catch { /* Some publishers emit invalid JSON-LD. */ } });
  const candidates: any[] = [];
  const visit = (value: any) => { if (!value || typeof value !== 'object') return; if (value.articleBody || value['@type'] === 'Article' || value['@type'] === 'NewsArticle' || value['@type'] === 'ScholarlyArticle') candidates.push(value); Object.values(value).forEach(visit); };
  values.forEach(visit);
  const article = candidates.sort((a, b) => String(b.articleBody ?? '').length - String(a.articleBody ?? '').length)[0];
  if (!article?.articleBody || String(article.articleBody).trim().length < 300) return undefined;
  const authors = Array.isArray(article.author) ? article.author.map((author: any) => typeof author === 'string' ? author : author?.name).filter(Boolean) : article.author?.name ? [article.author.name] : [];
  return { body: cleanText(String(article.articleBody)), title: article.headline || article.name, authors, abstract: article.description };
}

function semanticCandidates(html: string, isPmc: boolean) {
  const candidates: { fragment: string; method: 'semantic' | 'readability'; hint: number }[] = [];
  const patterns = isPmc
    ? [/<article\b[^>]*>([\s\S]*?)<\/article>/i, /<div[^>]*(?:id|class)=["'][^"']*(?:maincontent|article[-_ ]?(?:body|content)|pmc[-_ ]?article)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i]
    : [/<article\b[^>]*>([\s\S]*?)<\/article>/i, /<main\b[^>]*>([\s\S]*?)<\/main>/i, /<div[^>]*(?:id|class)=["'][^"']*(?:article[-_ ]?(?:body|content)|main[-_ ]?content|post[-_ ]?content|entry[-_ ]?content|story[-_ ]?body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i];
  patterns.forEach((pattern) => { const match = html.match(pattern); if (match?.[1]) candidates.push({ fragment: match[1], method: 'semantic', hint: 1 }); });
  const blocks = Array.from(removeBoilerplateBlocks(html).matchAll(/<(?:p|h[1-6]|li|figcaption|td|pre)\b[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li|figcaption|td|pre)>/gi)).map((match) => htmlFragmentToArticleText(match[1])).filter((text) => text.length > 15 || /^[A-Z][^.!?]{2,60}$/.test(text));
  if (blocks.length) candidates.push({ fragment: blocks.join('\n\n'), method: 'readability', hint: 0.6 });
  return candidates;
}

function articleTitle(html: string, body: string, structured?: { title?: string }) {
  return structured?.title?.toString().trim() || metaContent(html, 'og:title') || metaContent(html, 'citation_title') || html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] && htmlFragmentToArticleText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)![1]) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] && htmlFragmentToArticleText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]) || body.split('\n')[0];
}

function articleAuthors(html: string, structuredAuthors: string[]) {
  const values = [...structuredAuthors, ...Array.from(html.matchAll(/<meta[^>]*(?:name|property)=["'](?:citation_author|author)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)).map((match) => decodeHtml(match[1])), ...Array.from(html.matchAll(/<(?:span|a|div)[^>]*(?:class|itemprop)=["'][^"']*author[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|a|div)>/gi)).map((match) => htmlFragmentToArticleText(match[1]))];
  return Array.from(new Set(values.map((value) => cleanText(value)).filter((value) => value && value.length < 180))).slice(0, 12);
}

function dedupeArticleText(text: string) {
  let previous = ''; const lines: string[] = [];
  text.split(/\n+/).forEach((line) => { const normalized = line.trim().toLowerCase().replace(/\s+/g, ' '); if (normalized && normalized !== previous) lines.push(line.trim()); previous = normalized; });
  return cleanText(lines.join('\n\n'));
}

export function extractArticleFromHtml(html: string, sourceUrl: string): ArticleExtraction {
  const url = new URL(sourceUrl); const isPmc = /(?:ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pmc|pmc\.ncbi)/i.test(url.hostname + url.pathname);
  const structured = structuredArticle(html);
  const candidates = semanticCandidates(html, isPmc);
  const semantic = candidates.filter((candidate) => candidate.method === 'semantic').sort((a, b) => htmlFragmentToArticleText(b.fragment).length - htmlFragmentToArticleText(a.fragment).length)[0];
  const fallback = candidates.find((candidate) => candidate.method === 'readability');
  const semanticText = semantic ? htmlFragmentToArticleText(isPmc ? removePmcReferenceBlocks(semantic.fragment) : semantic.fragment) : '';
  const fallbackText = fallback ? htmlFragmentToArticleText(fallback.fragment) : '';
  const useSemantic = Boolean(semanticText) && (!fallbackText || semanticText.split(/\s+/).length >= Math.max(20, fallbackText.split(/\s+/).length * 0.5));
  const body = removeArticleReferenceNoise(structured?.body || (useSemantic ? semanticText : fallbackText || htmlFragmentToArticleText(html)));
  const method = structured ? 'json-ld' : useSemantic ? 'semantic' : fallback ? 'readability' : 'fallback';
  const title = articleTitle(html, body, structured);
  const authors = articleAuthors(html, structured?.authors ?? []);
  const abstractHtml = html.match(/<(?:section|div)[^>]*(?:id|class)=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/(?:section|div)>/i)?.[1];
  const abstract = structured?.abstract || (abstractHtml ? htmlFragmentToArticleText(abstractHtml) : undefined);
  const bodyWithoutTitle = body.split('\n').filter((line) => line.trim().toLowerCase() !== title?.trim().toLowerCase()).join('\n');
  const assembled = dedupeArticleText([title, authors.length ? `By ${authors.join(', ')}` : '', abstract && !bodyWithoutTitle.toLowerCase().includes(abstract.toLowerCase()) ? `Abstract\n${abstract}` : '', bodyWithoutTitle].filter(Boolean).join('\n\n'));
  const wordCount = assembled.split(/\s+/).filter(Boolean).length;
  const navigationWords = (assembled.match(/\b(?:home|menu|search|login|subscribe|download|share|cite|collections|permalink|similar articles|view on publisher site)\b/gi) ?? []).length;
  const repeats = assembled.split(/\n+/).filter((line, index, lines) => lines.indexOf(line) !== index).length;
  const warnings: string[] = [];
  if (wordCount < 80) warnings.push('The extracted article is unusually short.');
  if (!title || title.length < 4) warnings.push('A clear article title was not detected.');
  if (navigationWords > Math.max(5, wordCount * 0.08)) warnings.push('Navigation or control text may be mixed into the article.');
  if (repeats > 3) warnings.push('Repeated page text was detected.');
  if (method === 'fallback') warnings.push('No clear article container was found.');
  const confidence = Math.max(0, Math.min(1, (wordCount >= 300 ? 0.45 : wordCount >= 80 ? 0.3 : 0.12) + (title ? 0.15 : 0) + (authors.length || abstract ? 0.1 : 0) + (method === 'json-ld' ? 0.25 : method === 'semantic' ? 0.2 : method === 'readability' ? 0.12 : 0.02) - Math.min(0.25, navigationWords / Math.max(1, wordCount)) - Math.min(0.15, repeats * 0.02)));
  return { text: assembled, title: title?.trim() || undefined, format: 'Article', sourceUrl, sourceDomain: url.hostname, sourceType: 'url', author: authors[0], sections: sectionsFromText(assembled, title?.trim()), extractionMethod: method, extractionConfidence: confidence, extractionWarnings: warnings, authors, abstract, confidence, suspicious: warnings.length > 0 || confidence < 0.55, warnings, method };
}
