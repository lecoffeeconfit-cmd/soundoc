import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function runChapterNavigationFixtures() {
  const source = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');
  if (!source.includes('Open chapters and bookmarks')) throw new Error('The reader needs an accessible chapter navigator action');
  if (!source.includes('styles.chapterRowActive')) throw new Error('The chapter list needs an active current-chapter state');
  if (!source.includes("suggested ? 'Suggested section' : 'Chapter'") || !source.includes('${index + 1}')) throw new Error('Chapter rows should be visibly numbered and distinguish suggestions');
  if (!source.includes('CURRENT CHAPTER')) throw new Error('The player should expose the current chapter context');
  if (!source.includes('Section unavailable')) throw new Error('Missing section targets should stay visible instead of silently closing the sheet');
  if (!source.includes('player.jumpToSection(sectionIndex)')) throw new Error('Inline chapter jumps should use the player’s canonical section seek path');
  const playerSource = readFileSync(resolve(process.cwd(), 'src/hooks/useSpeechPlayer.ts'), 'utf8');
  if (!playerSource.includes('source.indexOf(probe, cursor)') || !playerSource.includes('index <= sectionIndex')) throw new Error('Inline section seeks must resolve repeated headings in document order');
}

runChapterNavigationFixtures();
