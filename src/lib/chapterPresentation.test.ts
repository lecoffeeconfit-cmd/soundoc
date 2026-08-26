import { formatChapterSummary } from './chapterPresentation';
import type { SoundocSection } from '../types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function runChapterPresentationFixtures() {
  const sections: SoundocSection[] = [
    { id: 'section-1', title: 'Chapter One', level: 1, text: 'Opening body.', order: 0 },
    { id: 'section-2', title: 'Chapter Two', level: 1, text: 'Second body.', order: 1 },
  ];
  if (formatChapterSummary(sections) !== '2 chapters detected') throw new Error('Multiple detected sections should use chapter copy');
  if (formatChapterSummary(sections.map((section) => ({ ...section, text: '' }))) !== '2 chapters detected') throw new Error('Chunk-backed chapter metadata should count without inline section text');
  if (formatChapterSummary([{ ...sections[0], text: '' }]) !== '1 reading section') throw new Error('A fallback section should use neutral section copy');
  if (formatChapterSummary(undefined) !== '1 reading section') throw new Error('Missing section metadata should use neutral section copy');

  const appSource = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');
  if (!appSource.includes('sections: metadata?.sections ?? sectionsFromText(cleaned, resolvedTitle, { suggestSections: true })')) throw new Error('New short imports must persist detector-backed sections with the resolved title');
  if (!appSource.includes("const resolvedTitle = title?.trim() || (cleaned ? suggestedTitle(cleaned) : 'Untitled document')")) throw new Error('Title-less imports need a stable fallback title');
  if (!appSource.includes('formatChapterSummary(item.sections)')) throw new Error('Prepared import confirmation must show chapter summary copy');
}

runChapterPresentationFixtures();
