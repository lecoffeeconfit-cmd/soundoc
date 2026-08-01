import { filterLongNumbersAndCodes } from './text';

export function runLongNumberRuleFixtures() {
  const skipped = filterLongNumbersAndCodes([
    'doi:10.3390/nu13020447',
    'PMID: 33572884',
    'PMCID: PMC7910963',
    'ORCID 0000-0002-1825-0097',
    '2001;191:139–144.',
    '[ DOI ] [ PubMed ] [ Google Scholar ]',
    'S0022-510X(01)00611-6',
    'The study included 200 participants.',
    'Participants took 5 grams per day.',
    'Performance improved by 12 percent.',
    'The article was published in 2021.',
    'Section 3 discusses the results.',
    'p = 0.03.'
  ].join('\n'), { enabled: true });
  if (skipped.spokenText.includes('33572884') || skipped.spokenText.includes('PMC7910963') || skipped.spokenText.includes('139–144')) throw new Error('identifier/reference metadata was not skipped');
  for (const value of ['200 participants', '5 grams', '12 percent', '2021', 'Section 3', 'p = 0.03']) if (!skipped.spokenText.includes(value)) throw new Error(`meaningful number was removed: ${value}`);
  if (!skipped.removedSegments.length) throw new Error('removed segments were not reported');
  const disabled = filterLongNumbersAndCodes('PMID: 33572884', { enabled: false });
  if (disabled.spokenText !== 'PMID: 33572884' || disabled.removedSegments.length) throw new Error('disabled rule changed text');
  if (filterLongNumbersAndCodes('', { enabled: true }).spokenText !== '') throw new Error('empty input failed');
  return skipped;
}
