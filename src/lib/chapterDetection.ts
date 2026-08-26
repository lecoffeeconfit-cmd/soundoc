import type { SoundocSection } from '../types';
import { summarizeSectionText } from './sectionIntelligence';

const namedSections = /^(?:foreword|preface|prologue|introduction|contents|table of contents|conclusion|epilogue|appendix(?:\s+[A-Za-z0-9][A-Za-z0-9 .:'’()-]*)?|afterword|references|bibliography)$/i;
const writtenNumbers = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?';
const chapterHeading = new RegExp(`^chapter\\s+(?:\\d+|[ivxlcdm]+|${writtenNumbers})(?:\\s*[:.-]\\s*.*)?$`, 'i');
const partHeading = new RegExp(`^part\\s+(?:\\d+|[ivxlcdm]+|${writtenNumbers})(?:\\s*[:.-]\\s*.*)?$`, 'i');
const numberedHeading = /^\d+(?:\.\d+)*[.)]?\s+\S/;
const markdownHeading = /^(#{1,6})\s+\S/;
const sectionVariantHeading = new RegExp('^section\\s+(?:\\d+|[ivxlcdm]+|' + writtenNumbers + ')(?:\\s*[:.-]\\s*.*|\\s+.+)?$', 'i');
const chapterVariantHeading = new RegExp('^chapter\\s+(?:\\d+|[ivxlcdm]+|' + writtenNumbers + ')\\s+.+$', 'i');
const partVariantHeading = new RegExp('^part\\s+(?:\\d+|[ivxlcdm]+|' + writtenNumbers + ')\\s+.+$', 'i');
const chapterOrPartSuffix = /^(?:chapter|part)\s+(?:\d+|[ivxlcdm]+|[a-z]+)(?:\s*[:.-]\s*|\s+)(.+)$/i;
const sectionSuffix = new RegExp('^section\\s+(?:\\d+|[ivxlcdm]+|' + writtenNumbers + ')(?:\\s*[:.-]\\s*|\\s+)(.+)$', 'i');
const headingTitleShape = /^[A-Z0-9][A-Za-z0-9'’()/,:&-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'’()/,:&-]*)*$/;

type NormalizedLine = { line: string; index: number; breakBefore: boolean };

function normalizedLines(text: string): NormalizedLine[] {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  const lines: NormalizedLine[] = [];
  let previousSourceIndex = -1;
  rawLines.forEach((rawLine, sourceIndex) => {
    const line = rawLine.trim();
    if (!line) return;
    lines.push({ line, index: lines.length, breakBefore: lines.length > 0 && sourceIndex > previousSourceIndex + 1 });
    previousSourceIndex = sourceIndex;
  });
  return lines.filter((entry) => entry.line.length > 0);
}

function scoringLines(lines: NormalizedLine[]): NormalizedLine[] {
  const counts = new Map<string, number>();
  lines.forEach(({ line }) => counts.set(line, (counts.get(line) ?? 0) + 1));
  return lines.filter(({ line }) => !/^page\s*\d+$/i.test(line) && !/^\d{1,4}[.)]?$/.test(line) && (counts.get(line) ?? 0) === 1);
}

function isPageNoise(line: string): boolean {
  return /^page\s*\d+$/i.test(line) || /^\d{1,4}[.)]?$/.test(line);
}

function hasReadableBody(
  heading: { index: number },
  nextHeadingIndex: number,
  sourceLines: NormalizedLine[],
  headingIndexes: Set<number>,
): boolean {
  return sourceLines.slice(heading.index + 1, nextHeadingIndex).some((entry) => !isPageNoise(entry.line) && !headingIndexes.has(entry.index));
}

function titleLike(line: string, entry: NormalizedLine, lines: NormalizedLine[]): boolean {
  if (!entry.breakBefore) return false;
  const index = entry.index;
  if (index === 0 || index === lines.length - 1 || line.length > 80 || /[.!?]$/.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length > 10 || words.length < 1 || /[,;]$/.test(line)) return false;
  return /^[A-Z0-9][A-Za-z0-9 '&’()/:-]*$/.test(line) && (words.length <= 6 || words.every((word) => /^[A-Z0-9][A-Za-z0-9'’/-]*$/.test(word)));
}

function hasHeadingTitleShape(line: string, suffixPattern: RegExp) {
  const suffix = suffixPattern.exec(line)?.[1].trim();
  return !suffix || suffix.length <= 100 && !/[.!?]$/.test(suffix) && headingTitleShape.test(suffix);
}

function candidate(line: string, entry: NormalizedLine, lines: NormalizedLine[]): { title: string; level: number; score: number } | undefined {
  const markdown = markdownHeading.exec(line);
  const title = markdown ? line.slice(markdown[0].indexOf(' ') + 1).trim() : line;
  if (markdown) return { title, level: markdown[1].length, score: 90 };
  if (namedSections.test(line)) return { title: line, level: 1, score: 100 };
  if (chapterHeading.test(line) && hasHeadingTitleShape(line, chapterOrPartSuffix)) return { title: line, level: 1, score: 100 };
  if (chapterVariantHeading.test(line) && hasHeadingTitleShape(line, chapterOrPartSuffix)) return { title: line, level: 1, score: 100 };
  if (partHeading.test(line) && hasHeadingTitleShape(line, chapterOrPartSuffix)) return { title: line, level: 1, score: 90 };
  if (partVariantHeading.test(line) && hasHeadingTitleShape(line, chapterOrPartSuffix)) return { title: line, level: 1, score: 90 };
  if (sectionVariantHeading.test(line) && hasHeadingTitleShape(line, sectionSuffix)) return { title: line, level: 2, score: 85 };
  if (numberedHeading.test(line)) return { title: line, level: 2, score: 75 };
  if (titleLike(line, entry, lines)) return { title: line, level: 2, score: 35 };
  return undefined;
}

function fallbackSection(text: string, title?: string): SoundocSection {
  return { id: 'section-1', title, level: 1, text, order: 0, kind: 'fallback', summary: summarizeSectionText(text, title) };
}

export function detectDocumentSections(text: string, title?: string): SoundocSection[] {
  const sourceLines = normalizedLines(text);
  if (!sourceLines.length) return [fallbackSection('', title)];

  const readableLines = scoringLines(sourceLines);
  const candidates = readableLines.map((entry) => {
    const value = candidate(entry.line, entry, readableLines);
    return value ? { ...value, index: entry.index } : undefined;
  }).filter((value): value is { title: string; level: number; score: number; index: number } => Boolean(value));
  const explicitCandidates = candidates.filter((value) => value.score >= 75);
  const explicitHeadingIndexes = new Set(explicitCandidates.map((value) => value.index));
  const strongCandidates = explicitCandidates.filter((value, index, values) => {
    const nextHeadingIndex = values[index + 1]?.index ?? sourceLines.length;
    return hasReadableBody(value, nextHeadingIndex, sourceLines, explicitHeadingIndexes);
  });
  const weakCandidates = candidates.filter((value) => value.score < 75);
  const weakHeadingIndexes = new Set(weakCandidates.map((value) => value.index));
  const readableWeakCandidates = weakCandidates.filter((value, index, values) => hasReadableBody(value, values[index + 1]?.index ?? sourceLines.length, sourceLines, weakHeadingIndexes));
  const accepted = strongCandidates.length ? strongCandidates : readableWeakCandidates.length >= 2 ? readableWeakCandidates : [];
  if (!accepted.length) return [fallbackSection(sourceLines.map(({ line }) => line).join('\n'), title)];

  return accepted.map((heading, sectionIndex) => {
    const start = sectionIndex === 0 ? 0 : heading.index;
    const end = accepted[sectionIndex + 1]?.index ?? sourceLines.length;
    const sectionText = sourceLines.slice(start, end).map(({ line }) => line).join('\n');
    return { id: `section-${sectionIndex + 1}`, title: heading.title, level: heading.level, text: sectionText, order: sectionIndex, kind: 'structural', summary: summarizeSectionText(sectionText, heading.title) };
  });
}
