import { academicText, adaptiveChange, answerFromPassages, compareOriginalAndSpoken, explainPassage, generateFlashcards, generateReviewQuestions, retrievePassages } from './documentIntelligence';

const sections = [{ id: 'abstract', title: 'Abstract', order: 0, text: 'The study examined memory after sleep. Participants completed a recall task.' }, { id: 'results', title: 'Results', order: 1, text: 'The sleep group recalled more words than the control group. Limitations included a small sample.' }];

export function runDocumentIntelligenceFixtures() {
  const text = sections.map((section) => section.text).join('\n\n');
  const passages = retrievePassages(text, sections, 'What happened to recall after sleep?');
  if (!passages.length || !passages[0].text.includes('sleep')) throw new Error('grounding retrieval failed');
  if (answerFromPassages('What is the weather?', [], 'local-extractive').found) throw new Error('empty grounding should not answer');
  const explanation = explainPassage(passages[0]);
  if (!explanation.source.sectionId || !explanation.shorter) throw new Error('explanation source missing');
  const cards = generateFlashcards(text, sections);
  if (!cards.length || !cards[0].sourceExcerpt) throw new Error('flashcard source missing');
  const review = generateReviewQuestions(text, sections);
  if (!review.length || !review[0].answer) throw new Error('review answer missing');
  if (academicText(text, sections).length !== 2) throw new Error('academic section detection failed');
  const adaptive = adaptiveChange('Methods: participants completed a randomized controlled experiment with a dense statistical analysis.', { rate: 1, sentencePauseMs: 250, paragraphPauseMs: 600 });
  if (adaptive.rate >= 1 || adaptive.sentencePauseMs <= 250) throw new Error('adaptive pacing failed');
  const diff = compareOriginalAndSpoken('Navigation\nReadable paragraph.', 'Readable paragraph.');
  if (!diff.removed.length) throw new Error('spoken preview diff failed');
  return { passages: passages.length, cards: cards.length, review: review.length };
}
