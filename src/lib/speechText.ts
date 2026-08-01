import { cleanText, filterLongNumbersAndCodes, segmentSentences } from './text';
import type { PronunciationRule, SpeechPreferences } from '../types';

export type SpeakableChunk = { text: string; pauseAfterMs: number; paragraphIndex: number; sentenceIndex: number; characterOffset: number; isHeading?: boolean };

const MAX_CHUNK_LENGTH = 3200;

function isHeading(line: string) {
  const value = line.trim();
  if (!value || value.length > 100) return false;
  if (/^#{1,6}\s+/.test(value)) return true;
  if (/[.!?]$/.test(value)) return false;
  const words = value.split(/\s+/);
  return words.length <= 10 && value.length >= 3 && (value === value.toUpperCase() || /^[A-Z][^.!?]*$/.test(value));
}

function applyRule(text: string, rule: PronunciationRule) {
  if (!rule.enabled || !rule.original.trim()) return text;
  const escaped = rule.original.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, rule.caseSensitive ? 'g' : 'gi'), () => rule.replacement);
}

export function applyPronunciationRules(text: string, rules: PronunciationRule[]) {
  return rules.reduce((value, rule) => applyRule(value, rule), text);
}

export function applyReadingRules(text: string, preferences: Pick<SpeechPreferences, 'skipHeadings' | 'skipUrls' | 'skipCitations' | 'skipConsecutiveDuplicates' | 'skipLongNumbersAndCodes' | 'recommendedListening' | 'skipReferenceSection' | 'skipSiteBoilerplate'>) {
  const numberCodeFiltered = filterLongNumbersAndCodes(text, { enabled: preferences.skipLongNumbersAndCodes !== false }).spokenText;
  const cleaned = cleanText(numberCodeFiltered);
  const referenceTrimmed = preferences.skipReferenceSection ? cleaned.replace(/\n{2,}(?:references|bibliography|literature cited|works cited)\s*\n[\s\S]*$/i, '') : cleaned;
  const paragraphs = referenceTrimmed.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  let previousKey = '';
  const kept: string[] = [];
  paragraphs.forEach((paragraph) => {
    const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
    const filteredLines = lines.filter((line) => {
      if (preferences.skipHeadings && isHeading(line)) return false;
      if (preferences.skipUrls && /^https?:\/\/\S+$/i.test(line)) return false;
      if (preferences.skipCitations && (/^\s*(?:\[\d+(?:,\s*\d+)*\]|\(\d+(?:,\s*\d+)*\))\s*$/.test(line) || /^\s*\[\d+(?:[-–]\d+)?\]/.test(line))) return false;
      if (preferences.skipSiteBoilerplate && /^(?:advertisement|advertising|menu|navigation|share|sharing|download|cite|collections?|permalink|view on publisher site|related articles?|related content|cookie(?: notice| settings)?|subscribe|sign in|log in|home|search)$/i.test(line)) return false;
      return true;
    });
    const dedupedLines = preferences.skipConsecutiveDuplicates ? filteredLines.filter((line, index) => index === 0 || line.toLowerCase().replace(/\s+/g, ' ') !== filteredLines[index - 1].toLowerCase().replace(/\s+/g, ' ')) : filteredLines;
    let value = dedupedLines.join(preferences.skipSiteBoilerplate ? '\n' : ' ');
    if (preferences.skipUrls) value = value.replace(/https?:\/\/\S+/gi, 'link');
    if (preferences.skipCitations) value = value.replace(/\[\d+(?:[-–,\s]*\d+)*\]/g, '').replace(/\s{2,}/g, ' ').trim();
    if (preferences.skipConsecutiveDuplicates) {
      const sentences = segmentSentences(value);
      value = sentences.filter((sentence, index) => index === 0 || sentence.toLowerCase().replace(/\s+/g, ' ') !== sentences[index - 1].toLowerCase().replace(/\s+/g, ' ')).join(' ');
    }
    const key = value.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!value || (preferences.skipConsecutiveDuplicates && key === previousKey)) return;
    previousKey = key;
    kept.push(value);
  });
  return kept.join('\n\n');
}

export function processSpeechText(text: string, preferences: SpeechPreferences, language = 'en-US'): SpeakableChunk[] {
  const ruled = applyReadingRules(text, preferences);
  const substituted = applyPronunciationRules(ruled, preferences.pronunciationRules);
  const paragraphs = cleanText(substituted).split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks: SpeakableChunk[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const lines = preferences.skipHeadings === false ? paragraph.split('\n').map((line) => line.trim()).filter(Boolean) : [paragraph];
    lines.forEach((line) => {
      const heading = preferences.skipHeadings === false && isHeading(line);
      const sentences = segmentSentences(line, language);
      sentences.forEach((sentence, sentenceIndex) => {
        for (let offset = 0; offset < sentence.length; offset += MAX_CHUNK_LENGTH) {
          const part = sentence.slice(offset, offset + MAX_CHUNK_LENGTH).trim();
          if (part) chunks.push({ text: part, pauseAfterMs: 0, paragraphIndex, sentenceIndex, characterOffset: offset, isHeading: heading });
        }
      });
    });
  });
  chunks.forEach((chunk, index) => {
    const next = chunks[index + 1];
    chunk.pauseAfterMs = next && next.paragraphIndex !== chunk.paragraphIndex ? preferences.paragraphPauseMs : next && chunk.isHeading ? (preferences.headingPauseMs ?? preferences.paragraphPauseMs) : next && next.sentenceIndex !== chunk.sentenceIndex ? preferences.sentencePauseMs : 0;
  });
  return chunks;
}
