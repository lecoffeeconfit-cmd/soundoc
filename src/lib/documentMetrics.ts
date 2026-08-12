import { countWords } from './text';

/** A deliberately conservative reading-page approximation for reflowable text. */
export const WORDS_PER_ESTIMATED_PAGE = 475;

export type DocumentLengthClass = 'short' | 'normal' | 'long' | 'veryLong';

export function estimateDocumentPages(textOrWords: string | number) {
  const words = typeof textOrWords === 'number' ? textOrWords : countWords(textOrWords);
  return words ? Math.max(1, Math.ceil(words / WORDS_PER_ESTIMATED_PAGE)) : undefined;
}

export function classifyDocumentLength(input: { wordCount?: number; pageCount?: number; characterCount?: number }): DocumentLengthClass {
  const pages = input.pageCount ?? estimateDocumentPages(input.wordCount ?? Math.ceil((input.characterCount ?? 0) / 5)) ?? 0;
  if (pages >= 700) return 'veryLong';
  if (pages >= 120) return 'long';
  if (pages >= 20) return 'normal';
  return 'short';
}

export function hasExactPageCount(sourceType?: string, format?: string) {
  return sourceType === 'pdf' || format?.toLowerCase() === 'pdf';
}

export function formatDocumentPages(pageCount?: number, exact = false) {
  if (!pageCount || !Number.isFinite(pageCount)) return undefined;
  return `${exact ? '' : '~'}${Math.max(1, Math.round(pageCount)).toLocaleString()} ${pageCount === 1 ? 'page' : 'pages'}`;
}
