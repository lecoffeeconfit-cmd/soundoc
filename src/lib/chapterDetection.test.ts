import { detectDocumentSections } from './chapterDetection';
import { libraryItemToDocument } from './documents';
import type { LibraryItem } from '../types';

export function runChapterDetectionFixtures() {
  const sections = detectDocumentSections(`Preface\nA short opening.\n\nChapter I\nThe first body.\n\nChapter 2: Turning Point\nThe second body.`, 'Book');
  if (sections.map((section) => section.title).join('|') !== 'Preface|Chapter I|Chapter 2: Turning Point') throw new Error('Explicit chapter headings should become ordered sections');

  const numbered = detectDocumentSections(`1. The Beginning\nOpening text.\n\n2. Methods\nMethod text.`, 'Report');
  if (numbered.length !== 2 || numbered[1]?.title !== '2. Methods') throw new Error('Numbered headings should be detected');

  const noisy = detectDocumentSections(`My Book\n1\nMy Book\nChapter 1\nThe body.\nMy Book\n1\nChapter 2\nMore body.`, 'My Book');
  if (noisy.length !== 2 || noisy.some((section) => section.title === 'My Book' || section.title === '1')) throw new Error('Repeated PDF noise must not create chapters');

  const fallback = detectDocumentSections('This is a continuous essay with no reliable heading candidates. It should remain one readable section.', 'Essay');
  if (fallback.length !== 1 || fallback[0]?.title !== 'Essay') throw new Error('Low-signal text should fall back to one titled section');

  const repeatedBody = detectDocumentSections('Chapter 1\nRepeated body line.\nRepeated body line.\nChapter 2\nMore body.', 'Book');
  if (repeatedBody[0]?.text !== 'Chapter 1\nRepeated body line.\nRepeated body line.') throw new Error('Repeated readable body text must remain in section playback text');

  const isolated = detectDocumentSections('Chapter 1\nChapter 2\nThe second body.', 'Book');
  if (isolated.length !== 1 || isolated[0]?.title !== 'Chapter 2') throw new Error('Structural headings without readable body must not become sections');

  const mixedMarkdown = detectDocumentSections('# Introduction\nOpening body.\n###### Deep Detail\nDetail body.\nChapter 2\nSecond body.', 'Book');
  if (mixedMarkdown.length !== 3 || mixedMarkdown[1]?.title !== 'Deep Detail' || mixedMarkdown[1]?.level !== 6) throw new Error('Markdown headings at every level must survive stronger heading scoring');

  const writtenAndStructural = detectDocumentSections('Chapter Twenty-Five\nFirst body.\nPart Two\nPart body.\nSection 3\nSection body.', 'Book');
  if (writtenAndStructural.map((section) => section.title).join('|') !== 'Chapter Twenty-Five|Part Two|Section 3') throw new Error('Written-number, part, and section headings should be detected');

  const structuralVariants = detectDocumentSections('Foreword\nOpening note.\nSection IV\nThe fourth section.\nAppendix A\nSupporting material.\nReferences\nSources.', 'Book');
  if (structuralVariants.map((section) => section.title).join('|') !== 'Foreword|Section IV|Appendix A|References') throw new Error('Common structural chapter variants should be detected');
  const longSectionNumber = detectDocumentSections('Section Ninety-Five\nLong section body.', 'Book');
  if (longSectionNumber.length !== 1 || longSectionNumber[0]?.title !== 'Section Ninety-Five') throw new Error('Written section numbers should use the same range as chapter numbers');

  const titleCasedProse = detectDocumentSections('A Clear Idea\nAnother Clear Idea\nThird Clear Idea\nFourth Clear Idea', 'Essay');
  if (titleCasedProse.length !== 1 || titleCasedProse[0]?.title !== 'Essay') throw new Error('Ordinary title-cased prose must not become many false chapters');

  const proseChapterMention = detectDocumentSections('Chapter of the book describes a useful idea.\nThe next sentence continues the paragraph.', 'Essay');
  if (proseChapterMention.length !== 1 || proseChapterMention[0]?.title !== 'Essay') throw new Error('Prose that mentions a chapter must not become a structural heading');

  const sentenceLikeHeading = detectDocumentSections('Chapter 1 describes a useful idea.\nThe next sentence continues the paragraph.', 'Essay');
  if (sentenceLikeHeading.length !== 1 || sentenceLikeHeading[0]?.title !== 'Essay') throw new Error('Sentence-like chapter labels must not become structural headings');

  const sentenceLikeSection = detectDocumentSections('Section 3 describes a useful idea\nThe next sentence continues the paragraph.', 'Essay');
  if (sentenceLikeSection.length !== 1 || sentenceLikeSection[0]?.title !== 'Essay') throw new Error('Sentence-like section labels must not become structural headings');

  const punctuationSentence = detectDocumentSections('Chapter 1: describes a useful idea.\nThe next sentence continues the paragraph.\nPart 2 - explains the method.', 'Essay');
  if (punctuationSentence.length !== 1 || punctuationSentence[0]?.title !== 'Essay') throw new Error('Punctuation-delimited sentence labels must not become structural headings');

  const legacyItem = {
    id: 'legacy-book', type: 'document', title: 'Legacy Book', text: 'Chapter 1\nFirst body.\nChapter 2\nSecond body.', language: 'en-US', wordCount: 8,
    createdAt: 1, updatedAt: 2, sentenceIndex: 0, progress: 0, rate: 1, pitch: 1, completed: false,
  } as LibraryItem;
  const legacyDocument = libraryItemToDocument(legacyItem);
  if (legacyDocument.sections.length !== 1 || legacyDocument.sections[0]?.id !== 'document' || legacyDocument.sections[0]?.title !== 'Legacy Book' || legacyDocument.sections[0]?.text !== legacyItem.text) throw new Error('Legacy library rows without sections must retain one legacy section');
}

runChapterDetectionFixtures();
