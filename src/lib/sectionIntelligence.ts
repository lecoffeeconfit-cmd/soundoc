import { cleanText, countWords, segmentSentences } from './text';
import type { SoundocSection, SoundocSectionKind } from '../types';

const MIN_SUGGESTED_DOCUMENT_WORDS = 1_200;
const TARGET_SUGGESTED_SECTION_WORDS = 850;
const MIN_SUGGESTED_SECTION_WORDS = 320;
const MAX_SUGGESTED_SECTION_WORDS = 1_450;
const MAX_SUGGESTED_SECTIONS = 12;
const MAX_SUMMARY_LENGTH = 132;
const STOP_WORDS = new Set('a an and are as at be been but by can could for from had has have he her his how i if in into is it its may more most of on or our she should so than that the their them then there these they this to was we were what when where which who will with would you your'.split(' '));

type TextUnit = { text: string; wordCount: number };

function clip(text: string, maxLength = MAX_SUMMARY_LENGTH) {
  const value = cleanText(text);
  if (value.length <= maxLength) return value;
  const boundary = value.lastIndexOf(' ', maxLength - 1);
  return `${value.slice(0, boundary > 36 ? boundary : maxLength - 1).trimEnd()}…`;
}

function removeLeadingTitle(text: string, title?: string) {
  const value = cleanText(text);
  if (!value || !title) return value;
  const lines = value.split('\n');
  if (lines[0]?.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase()) return cleanText(lines.slice(1).join('\n'));
  return value;
}

export function summarizeSectionText(text: string, title?: string) {
  const body = removeLeadingTitle(text, title);
  if (!body) return undefined;
  const sentence = segmentSentences(body)[0] ?? body;
  return clip(sentence);
}

export function enrichSection(section: SoundocSection, fallbackKind: SoundocSectionKind = 'structural'): SoundocSection {
  return { ...section, kind: section.kind ?? fallbackKind, summary: section.summary ?? summarizeSectionText(section.text, section.title) };
}

export function enrichSections(sections: SoundocSection[], fallbackKind: SoundocSectionKind = 'structural') {
  return sections.map((section) => enrichSection(section, fallbackKind));
}

export function sectionKindForId(id: string): SoundocSectionKind {
  if (id.startsWith('suggested-section-')) return 'suggested';
  return 'structural';
}

export function isSuggestedSection(section: Pick<SoundocSection, 'id' | 'kind'> | { id: string; kind?: SoundocSectionKind }) {
  return section.kind === 'suggested' || section.id.startsWith('suggested-section-');
}

function textUnits(text: string): TextUnit[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  const blocks = cleaned.split(/\n{2,}/).map((block) => cleanText(block)).filter(Boolean);
  const source = blocks.length >= 3 ? blocks : segmentSentences(cleaned).reduce<string[]>((groups, sentence, index) => {
    const groupIndex = Math.floor(index / 5);
    groups[groupIndex] = groups[groupIndex] ? `${groups[groupIndex]} ${sentence}` : sentence;
    return groups;
  }, []);
  return source.flatMap((block) => {
    if (countWords(block) <= MAX_SUGGESTED_SECTION_WORDS) return [{ text: block, wordCount: countWords(block) }];
    const sentences = segmentSentences(block);
    const units: TextUnit[] = [];
    let buffer = '';
    sentences.forEach((sentence) => {
      if (buffer && countWords(`${buffer} ${sentence}`) > 220) {
        units.push({ text: buffer, wordCount: countWords(buffer) });
        buffer = '';
      }
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    });
    if (buffer) units.push({ text: buffer, wordCount: countWords(buffer) });
    return units;
  });
}

function keywords(text: string) {
  return new Set((text.toLocaleLowerCase().match(/[\p{L}][\p{L}\p{N}'’-]{2,}/gu) ?? []).filter((word) => !STOP_WORDS.has(word)));
}

function similarity(left: string, right: string) {
  const a = keywords(left); const b = keywords(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  a.forEach((word) => { if (b.has(word)) overlap += 1; });
  return overlap / Math.max(1, a.size + b.size - overlap);
}

function shiftScore(units: TextUnit[], boundary: number) {
  const before = units.slice(Math.max(0, boundary - 2), boundary).map((unit) => unit.text).join(' ');
  const after = units.slice(boundary, Math.min(units.length, boundary + 2)).map((unit) => unit.text).join(' ');
  const next = units[boundary]?.text ?? '';
  const cue = /^(?:however|in contrast|by contrast|meanwhile|another|a different|the next|turning to|on the other hand|historically|in practice|from this point|finally|in conclusion)\b/i.test(next) ? 0.25 : 0;
  return (1 - similarity(before, after)) * 0.75 + cue;
}

function nearestBoundary(units: TextUnit[], start: number, target: number) {
  let words = 0;
  let best: { index: number; score: number } | undefined;
  for (let index = start; index < units.length; index += 1) {
    words += units[index].wordCount;
    if (words < MIN_SUGGESTED_SECTION_WORDS) continue;
    if (words > MAX_SUGGESTED_SECTION_WORDS) break;
    const distance = Math.abs(words - target) / target;
    const score = shiftScore(units, index) - distance * 0.18;
    if (!best || score > best.score) best = { index: index + 1, score };
  }
  return best?.index ?? Math.min(units.length, start + 1);
}

/**
 * Creates lightweight, source-grounded navigation suggestions when a document has
 * no reliable headings. It never changes the listening text and intentionally uses
 * honest labels plus previews instead of pretending to know a canonical chapter title.
 */
export function suggestContentSections(text: string): SoundocSection[] {
  const cleaned = cleanText(text);
  if (countWords(cleaned) < MIN_SUGGESTED_DOCUMENT_WORDS) return [];
  const units = textUnits(cleaned);
  if (units.length < 3) return [];
  const totalWords = units.reduce((total, unit) => total + unit.wordCount, 0);
  if (totalWords < MIN_SUGGESTED_SECTION_WORDS * 2) return [];

  const sections: SoundocSection[] = [];
  let start = 0;
  while (start < units.length && sections.length < MAX_SUGGESTED_SECTIONS) {
    const remainingWords = units.slice(start).reduce((total, unit) => total + unit.wordCount, 0);
    const isLast = remainingWords <= MAX_SUGGESTED_SECTION_WORDS || sections.length === MAX_SUGGESTED_SECTIONS - 1;
    const end = isLast ? units.length : nearestBoundary(units, start, TARGET_SUGGESTED_SECTION_WORDS);
    const body = units.slice(start, end).map((unit) => unit.text).join('\n\n');
    if (countWords(body) < MIN_SUGGESTED_SECTION_WORDS && sections.length) {
      const previous = sections[sections.length - 1];
      previous.text = `${previous.text}\n\n${body}`;
      previous.summary = summarizeSectionText(previous.text, previous.title);
      break;
    }
    sections.push({
      id: `suggested-section-${sections.length + 1}`,
      title: `Suggested section ${sections.length + 1}`,
      level: 1,
      text: body,
      order: sections.length,
      kind: 'suggested',
      summary: summarizeSectionText(body),
    });
    start = end;
  }
  return sections.length > 1 ? sections : [];
}
