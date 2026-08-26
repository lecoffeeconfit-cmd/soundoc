import { sectionsFromText } from './documents';
import { isSuggestedSection, summarizeSectionText } from './sectionIntelligence';

function paragraph(topic: string, index: number) {
  return `${topic} shapes the way people understand this part of the document. The author develops the idea with a practical example and explains why it matters for the reader. This supporting detail keeps the passage grounded and gives the listener a clear thread to follow. Paragraph ${index} adds another connected point before the discussion moves forward.`;
}

export function runSectionIntelligenceFixtures() {
  const text = [
    Array.from({ length: 8 }, (_, index) => paragraph('Historical context and the origins of the subject', index)).join('\n\n'),
    Array.from({ length: 8 }, (_, index) => paragraph('Practical methods and decisions for applying the subject', index + 8)).join('\n\n'),
    Array.from({ length: 8 }, (_, index) => paragraph('Long-term effects and lessons for future work', index + 16)).join('\n\n'),
  ].join('\n\n');
  const suggested = sectionsFromText(text, 'Long document', { suggestSections: true });
  if (suggested.length < 2 || !suggested.every(isSuggestedSection)) throw new Error('Long unstructured documents should receive clearly marked suggested sections');
  if (suggested.some((section) => !section.summary)) throw new Error('Suggested sections should include source-grounded previews');
  if (suggested.map((section) => section.text).join('\n\n') !== text) throw new Error('Suggested sections must preserve the original readable text');

  const structural = sectionsFromText(`Chapter 1\n${paragraph('Opening chapter', 1)}\n\nChapter 2\n${paragraph('Second chapter', 2)}`, 'Book', { suggestSections: true });
  if (structural.length !== 2 || structural.some(isSuggestedSection)) throw new Error('Reliable chapters must remain structural instead of being replaced by suggestions');
  if (structural.some((section) => !section.summary)) throw new Error('Structural chapters should include a concise content preview');

  const short = sectionsFromText('A short note with no headings.', 'Note', { suggestSections: true });
  if (short.length !== 1 || isSuggestedSection(short[0])) throw new Error('Short unstructured text should keep its ordinary single-section fallback');
  if (summarizeSectionText('Chapter 1\nThe first body sentence explains the point.', 'Chapter 1') !== 'The first body sentence explains the point.') throw new Error('Section previews should skip the structural heading');
}

runSectionIntelligenceFixtures();
