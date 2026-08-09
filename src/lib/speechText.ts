import { cleanText, filterLongNumbersAndCodes, segmentSentences } from './text';
import type { PronunciationRule, SpeechPreferences } from '../types';

export type SpeakableChunk = { text: string; pauseAfterMs: number; paragraphIndex: number; sentenceIndex: number; characterOffset: number; isHeading?: boolean; isListItem?: boolean };

const MAX_CHUNK_LENGTH = 3200;

function normalizeWithoutSmartFiltering(input: string) {
  return input.replace(/\r\n?/g, '\n').replace(/[\u00A0\t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function isHeading(line: string) {
  const value = line.trim();
  if (!value || value.length > 100) return false;
  if (/^(?:[-*•‣▪◦]|\d+[.)]|[a-z][.)])\s+/i.test(value)) return false;
  if (/^#{1,6}\s+/.test(value)) return true;
  if (/[.!?]$/.test(value)) return false;
  const words = value.split(/\s+/);
  return words.length <= 10 && value.length >= 3 && (value === value.toUpperCase() || /^[A-Z][^.!?]*$/.test(value));
}

function isListItem(line: string) {
  return /^(?:[-*•‣▪◦]|\d+[.)]|[a-z][.)])\s+/i.test(line.trim());
}

function textForSpeech(line: string, heading: boolean) {
  if (heading) return line.replace(/^#{1,6}\s+/, '').trim();
  return line.replace(/^[-*•‣▪◦]\s+/, '').trim();
}

function applyRule(text: string, rule: PronunciationRule) {
  if (!rule.enabled || !rule.original.trim()) return text;
  const escaped = rule.original.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, rule.caseSensitive ? 'g' : 'gi'), () => rule.replacement);
}

function isSourceClutterLine(line: string) {
  const value = line.trim();
  if (/^(?:sources?(?: and notes)?|references?|bibliography|works cited|literature cited|further reading|endnotes?|footnotes?)\s*:?$/i.test(value)) return true;
  if (/^(?:sources?|article source|image source|original(?:ly)? published|read more|via)\s*:\s*.{1,240}$/i.test(value)) return true;
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(value)) return true;
  return /^(?:\[\d+\]|\d+[.)])\s+.{0,180}(?:doi\b|https?:\/\/|\b(?:19|20)\d{2}[;,.]\s*\d{1,4}(?:\(\d+\))?\s*[:;,]\s*\d{1,5}[-–]\d{1,5})/i.test(value);
}

function removeInlineCitations(value: string) {
  return value
    .replace(/[\[{]\s*\d{1,3}(?:\s*[-–,;]\s*\d{1,3})*\s*[\]}]/g, '')
    .replace(/\(\s*\d{1,3}(?:\s*[-–,;]\s*\d{1,3})*\s*\)/g, '')
    .replace(/\((?:(?:[A-Z][\p{L}'’.-]+\s*,\s*(?:19|20)\d{2}[a-z]?|[A-Z][\p{L}'’.-]+\s+(?:et\s+al\.?|(?:and|&)\s*[A-Z][\p{L}'’.-]+)\s*,?\s*(?:19|20)\d{2}[a-z]?))(?:\s*;\s*(?:[A-Z][\p{L}'’.-]+\s*,\s*(?:19|20)\d{2}[a-z]?|[A-Z][\p{L}'’.-]+\s+(?:et\s+al\.?|(?:and|&)\s*[A-Z][\p{L}'’.-]+)\s*,?\s*(?:19|20)\d{2}[a-z]?))*\)/gu, '')
    .replace(/([),.])[\u00B9\u00B2\u00B3\u2070-\u2079]+(?=\s|[.,;:)]|$)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

export function applyPronunciationRules(text: string, rules: PronunciationRule[]) {
  return rules.reduce((value, rule) => applyRule(value, rule), text);
}

/** Conservative cleanup for podcast-style listening. The source document remains unchanged. */
export function cleanForSmartListening(text: string) {
  const normalized = text.replace(/[\u00ad\u200b]/g, '').replace(/([A-Za-z])-[ \t]*\n[ \t]*([a-z])/g, '$1$2');
  const lines = normalized.split(/\r?\n/).map((line) => line.trim());
  const repeated = new Map<string, number>();
  lines.forEach((line) => { if (line && line.length < 90) repeated.set(line.toLowerCase(), (repeated.get(line.toLowerCase()) ?? 0) + 1); });
  return lines.filter((line) => {
    if (!line) return true;
    if (/^(?:page\s+)?\d{1,3}(?:\s+of\s+\d{1,3})?$/i.test(line)) return false;
    if (/^(?:page|p\.)\s*[-–—]?\s*\d{1,3}$/i.test(line)) return false;
    if (/^(?:table|figure|fig\.?|chart|graph)\s*\d*\s*[:.\-–—]?/i.test(line)) return false;
    if ((line.match(/\|/g)?.length ?? 0) >= 2 || (line.match(/\t/g)?.length ?? 0) >= 2) return false;
    if (/^[\d\s.,%$€£¥+\-–—()]+$/.test(line) && (line.match(/\d+(?:\.\d+)?/g)?.length ?? 0) >= 4) return false;
    if ((repeated.get(line.toLowerCase()) ?? 0) > 1 && line.length < 90) return false;
    return true;
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function filterLongNumbersPreservingStructure(text: string, enabled: boolean) {
  if (!enabled) return text;
  return text.split(/\n{2,}/).map((paragraph) => filterLongNumbersAndCodes(paragraph, { enabled: true }).spokenText.replace(/\n{2,}/g, '\n')).filter(Boolean).join('\n\n');
}

export function applyReadingRules(text: string, preferences: Pick<SpeechPreferences, 'skipHeadings' | 'skipUrls' | 'skipCitations' | 'skipConsecutiveDuplicates' | 'skipLongNumbersAndCodes' | 'recommendedListening' | 'skipReferenceSection' | 'skipSiteBoilerplate' | 'smartFilteringEnabled'>) {
  if (preferences.smartFilteringEnabled === false) return normalizeWithoutSmartFiltering(text);
  const numberCodeFiltered = filterLongNumbersPreservingStructure(cleanForSmartListening(text), preferences.skipLongNumbersAndCodes !== false);
  const cleaned = cleanText(numberCodeFiltered);
  const referenceTrimmed = preferences.skipReferenceSection ? cleaned.replace(/\n{2,}(?:sources?(?: and notes)?|references?|bibliography|literature cited|works cited|further reading|endnotes?|footnotes?)\s*:?\s*\n[\s\S]*$/i, '') : cleaned;
  const paragraphs = referenceTrimmed.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  let previousKey = '';
  const kept: string[] = [];
  paragraphs.forEach((paragraph) => {
    const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
    const filteredLines = lines.filter((line) => {
      if (preferences.skipHeadings && isHeading(line)) return false;
      if (preferences.skipUrls && /^https?:\/\/\S+$/i.test(line)) return false;
      if (preferences.skipCitations && (/^\s*(?:\[\d+(?:,\s*\d+)*\]|\(\d+(?:,\s*\d+)*\))\s*$/.test(line) || /^\s*\[\d+(?:[-–]\d+)?\]/.test(line))) return false;
      if (preferences.skipSiteBoilerplate && (/^(?:advertisement|advertising|menu|navigation|share|sharing|download|cite|collections?|permalink|view on publisher site|related articles?|related content|cookie(?: notice| settings)?|subscribe|sign in|log in|home|search)$/i.test(line) || isSourceClutterLine(line))) return false;
      return true;
    });
    const dedupedLines = preferences.skipConsecutiveDuplicates ? filteredLines.filter((line, index) => index === 0 || line.toLowerCase().replace(/\s+/g, ' ') !== filteredLines[index - 1].toLowerCase().replace(/\s+/g, ' ')) : filteredLines;
    let value = dedupedLines.join(preferences.skipSiteBoilerplate ? '\n' : ' ');
    if (preferences.skipUrls) value = value.replace(/https?:\/\/\S+/gi, 'link');
    if (preferences.skipCitations) value = removeInlineCitations(value);
    if (preferences.skipConsecutiveDuplicates) {
      value = value.split('\n').map((line) => {
        const sentences = segmentSentences(line);
        return sentences.filter((sentence, index) => index === 0 || sentence.toLowerCase().replace(/\s+/g, ' ') !== sentences[index - 1].toLowerCase().replace(/\s+/g, ' ')).join(' ');
      }).filter(Boolean).join('\n');
    }
    const key = value.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!value || (preferences.skipConsecutiveDuplicates && key === previousKey)) return;
    previousKey = key;
    kept.push(value);
  });
  return kept.join('\n\n');
}

/** Keeps playback near the same passage when speech-only filtering changes the chunk list. */
export function remapSpeechChunkIndex(previousChunks: readonly Pick<SpeakableChunk, 'text'>[], rebuiltChunks: readonly Pick<SpeakableChunk, 'text'>[], currentIndex: number) {
  if (!rebuiltChunks.length) return 0;
  if (!previousChunks.length) return Math.min(Math.max(0, currentIndex), rebuiltChunks.length - 1);
  const boundedCurrent = Math.min(Math.max(0, currentIndex), previousChunks.length - 1);
  const candidates = [boundedCurrent, boundedCurrent + 1, boundedCurrent - 1].filter((index) => index >= 0 && index < previousChunks.length);
  for (const candidateIndex of candidates) {
    const anchor = previousChunks[candidateIndex].text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 96);
    if (!anchor) continue;
    const match = rebuiltChunks.findIndex((chunk) => {
      const text = chunk.text.toLowerCase().replace(/\s+/g, ' ').trim();
      const prefix = text.slice(0, Math.min(96, text.length));
      return text.includes(anchor) || anchor.includes(prefix);
    });
    if (match >= 0) return match;
  }
  const progress = previousChunks.length <= 1 ? 0 : boundedCurrent / (previousChunks.length - 1);
  return Math.min(rebuiltChunks.length - 1, Math.max(0, Math.round(progress * (rebuiltChunks.length - 1))));
}

export function processSpeechText(text: string, preferences: SpeechPreferences, language = 'en-US'): SpeakableChunk[] {
  const ruled = applyReadingRules(text, preferences);
  const substituted = applyPronunciationRules(ruled, preferences.pronunciationRules);
  const paragraphs = (preferences.smartFilteringEnabled === false ? normalizeWithoutSmartFiltering(substituted) : cleanText(substituted)).split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks: SpeakableChunk[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const lines = preferences.skipHeadings === false ? paragraph.split('\n').map((line) => line.trim()).filter(Boolean) : [paragraph];
    lines.forEach((line) => {
      const heading = preferences.skipHeadings === false && isHeading(line);
      const listItem = isListItem(line);
      const sentences = segmentSentences(textForSpeech(line, heading), language);
      sentences.forEach((sentence, sentenceIndex) => {
        for (let offset = 0; offset < sentence.length; offset += MAX_CHUNK_LENGTH) {
          const part = sentence.slice(offset, offset + MAX_CHUNK_LENGTH).trim();
          if (part) chunks.push({ text: part, pauseAfterMs: 0, paragraphIndex, sentenceIndex, characterOffset: offset, isHeading: heading, isListItem: listItem });
        }
      });
    });
  });
  chunks.forEach((chunk, index) => {
    const next = chunks[index + 1];
    const basePause = !next ? 0 : chunk.isHeading ? (preferences.headingPauseMs ?? preferences.paragraphPauseMs) : next.paragraphIndex !== chunk.paragraphIndex ? preferences.paragraphPauseMs : chunk.isListItem || next.sentenceIndex !== chunk.sentenceIndex ? preferences.sentencePauseMs : 0;
    chunk.pauseAfterMs = preferences.podcastModeEnabled ? Math.max(basePause, next && chunk.isHeading ? 900 : next && next.paragraphIndex !== chunk.paragraphIndex ? 700 : basePause) : basePause;
  });
  return chunks;
}
