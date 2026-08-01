const WORDS_PER_MINUTE = 165;

export function cleanText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(^|\n)\s*(?:page\s*)?\d+\s*(?=\n|$)/gi, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Removes reference-list tails and citation-control rows from article text.
 * Manual notes are left untouched; callers should use this only for article-like sources. */
export function removeArticleReferenceNoise(input: string): string {
  const lines = cleanText(input).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const headingIndex = lines.findIndex((line, index) => index > 2 && /^(?:references|bibliography|literature cited|works cited)$/i.test(line));
  const body = headingIndex >= 0 ? lines.slice(0, headingIndex) : lines;
  return cleanText(body.filter((line) => !/^\[?\s*(?:doi|pubmed|google scholar|pdf|cite|collections?|permalink|view on publisher site)\s*\]?$/i.test(line) && !/^\d{1,4}[.)]?$/.test(line)).join('\n\n'));
}

export type RemovedSegment = { text: string; reason: 'DOI' | 'Database identifier' | 'Bibliographic metadata' | 'Long code sequence' | 'Reference-only number line' };

const identifierToken = /\b(?:doi\s*:\s*)?(?:10\.\d{4,9}\/[-._;()/:A-Z0-9]+|PMID\s*:?\s*\d{6,}|PMCID\s*:?\s*PMC\d{6,}|ISSN\s*:?\s*\d{4}[-–]\d{3}[\dX]|ISBN(?:-\d)?\s*:?\s*(?:97[89][\d-]{10,}|\d[\d-]{9,})|ORCID\s*:?\s*\d{4}-\d{4}-\d{4}-\d{4}|arXiv\s*:?\s*\d{4}\.\d{4,5}(?:v\d+)?|NCT\d{8}|[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Z0-9]{2,}[/-][A-Z0-9()/-]{7,})\b/gi;

function likelyBibliographicLine(line: string) {
  return /^(?:\d{4};\d{1,4}:\d{1,5}[-–]\d{1,5}|\d{4};\d{1,4}\s*:\s*\d{1,5}[-–]\d{1,5})\.?$/.test(line.trim()) || /^(?:\[?\s*(?:doi|pmid|pmcid|isbn|issn|orcid|arxiv|pubmed|google scholar|crossref|citation|volume|issue|pages?)\s*\]?\s*)+$/i.test(line.trim());
}

function likelyCodeLine(line: string) {
  const value = line.trim(); const digitCount = (value.match(/\d/g) ?? []).length; const letters = (value.match(/[A-Za-z]/g) ?? []).length; const separators = (value.match(/[\/:;()._-]/g) ?? []).length; const ordinaryWords = value.split(/\s+/).filter((word) => /[A-Za-z]{3,}/.test(word)).length;
  if (value.length < 9 || ordinaryWords > 5 || digitCount < 4) return false;
  return separators >= 1 && (digitCount + separators >= 7 || digitCount / Math.max(1, letters) > 0.75);
}

/** Applies the conservative speech-only long-number/code rule. */
export function filterLongNumbersAndCodes(text: string, options: { enabled: boolean }): { spokenText: string; removedSegments: RemovedSegment[] } {
  if (!options.enabled) return { spokenText: text, removedSegments: [] };
  const removedSegments: RemovedSegment[] = [];
  const spokenLines = cleanText(text).split(/\n+/).map((rawLine) => {
    const line = rawLine.trim(); if (!line) return '';
    if (/^\d{3,}[.)]?$/.test(line)) { removedSegments.push({ text: line, reason: 'Reference-only number line' }); return ''; }
    if (likelyBibliographicLine(line)) { removedSegments.push({ text: line, reason: 'Bibliographic metadata' }); return ''; }
    if (likelyCodeLine(line)) { removedSegments.push({ text: line, reason: identifierToken.test(line) && /doi|pmid|pmcid|issn|isbn|orcid|arxiv|nct/i.test(line) ? 'Database identifier' : 'Long code sequence' }); identifierToken.lastIndex = 0; return ''; }
    const replaced = line.replace(identifierToken, (match) => { const reason: RemovedSegment['reason'] = /^\s*10\./i.test(match) || /doi/i.test(match) ? 'DOI' : /^(?:\s*(?:19|20)\d{2};|\s*\d{4};)/.test(match) ? 'Bibliographic metadata' : 'Database identifier'; removedSegments.push({ text: match, reason }); return ''; });
    identifierToken.lastIndex = 0;
    return replaced.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
  }).filter(Boolean);
  return { spokenText: cleanText(spokenLines.join('\n\n')), removedSegments };
}

export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '$&\n');
  return cleanText(withoutNoise
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>'));
}

export function suggestedTitle(text: string): string {
  const candidate = cleanText(text).split(/\n+/).find((line) => line.trim().length > 3) ?? 'Untitled note';
  return candidate.length > 72 ? `${candidate.slice(0, 69).trimEnd()}…` : candidate;
}

export function countWords(text: string): number {
  return cleanText(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

export function estimateSeconds(words: number, rate = 1): number {
  return Math.max(1, Math.round((words / WORDS_PER_MINUTE) * 60 / rate));
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `About ${hours} hr${hours === 1 ? '' : 's'}${remaining ? ` ${remaining} min` : ''}`;
}

export function detectLanguage(text: string): string {
  if (/[぀-ヿ㐀-鿿]/.test(text)) return 'ja-JP';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es-ES';
  if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) return 'fr-FR';
  return 'en-US';
}

export function segmentSentences(text: string, language = 'en-US'): string[] {
  const clean = cleanText(text);
  try {
    const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locale?: string, options?: { granularity: 'sentence' }) => { segment: (value: string) => Iterable<{ segment: string }> } }).Segmenter;
    if (Segmenter) return Array.from(new Segmenter(language, { granularity: 'sentence' }).segment(clean), ({ segment }) => segment.trim()).filter(Boolean);
  } catch { /* use the conservative fallback below */ }
  return clean.match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
}

export function safePublicUrl(value: string): URL | undefined {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    const privateHost = host === 'localhost' || host.endsWith('.local') || /^127\.|^0\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || host.includes(':');
    return (url.protocol === 'https:' || url.protocol === 'http:') && !privateHost ? url : undefined;
  } catch { return undefined; }
}
