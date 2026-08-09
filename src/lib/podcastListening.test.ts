import { applyReadingRules, cleanForSmartListening, remapSpeechChunkIndex } from './speechText';

const rules = { skipHeadings: false, skipUrls: true, skipCitations: true, skipConsecutiveDuplicates: true, skipLongNumbersAndCodes: true, recommendedListening: true, skipReferenceSection: true, skipSiteBoilerplate: true, smartFilteringEnabled: true } as const;

export function runPodcastListeningFixtures() {
  const source = ['Article title', 'Page 12', '2024', 'Table 1: Revenue', '2023 | 18.2 | 13.7', 'The study found 18.2 percent growth in 2024 (Smith et al., 2023) [12].', 'Sources: Reuters, AP', 'Source: https://example.com/story', 'Article title'].join('\n');
  const cleaned = cleanForSmartListening(source);
  if (cleaned.includes('Page 12') || cleaned.includes('Table 1') || cleaned.includes('18.2 | 13.7')) throw new Error('smart listening did not remove structured noise');
  if (!cleaned.includes('2024') || !cleaned.includes('18.2 percent')) throw new Error('smart listening removed meaningful values');
  const spoken = applyReadingRules(source, rules);
  if (spoken.includes('Page 12') || spoken.includes('Table 1') || spoken.includes('example.com') || spoken.includes('Reuters') || spoken.includes('Smith et al.') || spoken.includes('[12]')) throw new Error('reading rules did not apply smart cleanup');
  const research = ['The conclusion remains (14) and is supported elsewhere.²', 'The 2024 survey (2024) covered 500 m².', '', 'Sources and notes', '', '1. Smith J. Example. 2023;12:100–110.', '2. https://example.com/reference'].join('\n');
  const researchSpoken = applyReadingRules(research, rules);
  if (!researchSpoken.includes('The conclusion remains and is supported elsewhere.') || !researchSpoken.includes('The 2024 survey (2024) covered 500 m².') || researchSpoken.includes('Smith J.') || researchSpoken.includes('example.com')) throw new Error('citation filtering removed meaningful dates/measurements or left source noise');
  const before = [{ text: 'Useful passage before.' }, { text: 'Source: https://example.com' }, { text: 'Useful passage after.' }];
  const after = [{ text: 'Useful passage before.' }, { text: 'Useful passage after.' }];
  if (remapSpeechChunkIndex(before, after, 1) !== 1) throw new Error('mid-listen filtering did not advance past source clutter');
  const original = applyReadingRules(source, { ...rules, smartFilteringEnabled: false });
  if (!original.includes('Page 12') || !original.includes('Table 1')) throw new Error('smart filtering off changed original text');
  return { removedPageNumber: true, preservedYear: true };
}
