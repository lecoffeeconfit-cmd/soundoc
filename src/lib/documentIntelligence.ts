import type { AdaptiveListeningChange, Flashcard, GroundedAnswer, IntelligenceProvider, PassageExplanation, PodcastScript, ReviewQuestion, SoundocSection, SourcePassage } from '../types';
import { cleanText, countWords, segmentSentences } from './text';

const STOP = new Set('a an and are as at be by for from has have in is it its of on or that the their this to was were with into than then these those we you your our they he she his her about after before can could should would may might not only also'.split(' '));
const words = (text: string) => text.toLowerCase().match(/[\p{L}][\p{L}\p{N}'’-]{2,}/gu) ?? [];
const sentenceList = (text: string) => segmentSentences(cleanText(text)).filter((sentence) => sentence.trim().length > 15);
const terms = (text: string) => { const frequency = new Map<string, number>(); words(text).forEach((word) => { if (!STOP.has(word)) frequency.set(word, (frequency.get(word) ?? 0) + 1); }); return frequency; };

function normalizeSections(text: string, sections?: SoundocSection[], title = 'Document'): SoundocSection[] { return sections?.length ? sections : [{ id: 'document', title, text, order: 0 }]; }

export function retrievePassages(text: string, sections: SoundocSection[] | undefined, query: string, limit = 4): SourcePassage[] {
  const queryTerms = new Set(words(query));
  const candidates: SourcePassage[] = [];
  let documentOffset = 0;
  normalizeSections(text, sections).forEach((section) => {
    sentenceList(section.text).forEach((sentence) => {
      const sentenceTerms = words(sentence); const overlap = sentenceTerms.reduce((score, word) => score + (queryTerms.has(word) ? 3 : 0), 0); const frequency = sentenceTerms.reduce((score, word) => score + (terms(section.text).get(word) ?? 0), 0) / Math.max(1, sentenceTerms.length);
      if (overlap > 0) { const startOffset = documentOffset + section.text.indexOf(sentence); candidates.push({ sectionId: section.id, sectionTitle: section.title || 'Section', text: sentence, startOffset: Math.max(documentOffset, startOffset), endOffset: Math.max(documentOffset, startOffset) + sentence.length }); }
      void frequency;
    });
    documentOffset += section.text.length + 2;
  });
  if (!candidates.length) return [];
  const deduped = candidates.filter((candidate, index) => candidates.findIndex((other) => other.text.toLowerCase() === candidate.text.toLowerCase()) === index);
  return deduped.slice(0, limit);
}

export function answerFromPassages(query: string, passages: SourcePassage[], provider: IntelligenceProvider = 'local-extractive'): GroundedAnswer {
  if (!passages.length) return { answer: 'This document does not contain enough information to answer that question.', provider, isGenerative: false, found: false, passages: [], limitations: ['No matching source passages were found; Soundoc did not use outside knowledge.'], generatedAt: new Date().toISOString() };
  const answer = passages.map((passage) => `${passage.text} [${passage.sectionTitle}]`).join(' ');
  return { answer, provider, isGenerative: false, found: true, passages, limitations: ['Extractive answer built only from matching passages in this document.'], generatedAt: new Date().toISOString() };
}

function definitionFor(term: string, context: string) { const sentence = sentenceList(context).find((candidate) => candidate.toLowerCase().includes(term.toLowerCase())); return sentence ? `In this document, “${term}” is used in this context: ${sentence}` : `The document uses “${term}”, but does not provide a formal definition.`; }
export function explainPassage(passage: SourcePassage, provider: IntelligenceProvider = 'local-extractive'): PassageExplanation {
  const candidateTerms = Array.from(terms(passage.text).entries()).filter(([, frequency]) => frequency >= 1).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([term]) => ({ term, definition: definitionFor(term, passage.text) }));
  const shortened = sentenceList(passage.text).slice(0, 2).join(' ') || passage.text.slice(0, 240);
  return { simple: shortened, shorter: shortened.length > 180 ? `${shortened.slice(0, 177)}…` : shortened, terms: candidateTerms, provider, isGenerative: false, uncertainty: 'This is a local explanation assembled from the selected passage; it does not add outside facts.', source: passage, limitations: ['No on-device generative model was available, so Soundoc used term extraction and source sentences.'] };
}

function difficulty(text: string): Flashcard['difficulty'] { const length = countWords(text); return length > 35 ? 'hard' : length > 18 ? 'medium' : 'easy'; }
export function generateFlashcards(text: string, sections?: SoundocSection[], limit = 8): Flashcard[] {
  const cards: Flashcard[] = []; normalizeSections(text, sections).forEach((section) => { const sentences = sentenceList(section.text); const heading = section.title || 'Document'; sentences.slice(0, Math.max(1, Math.ceil(limit / Math.max(1, (sections?.length ?? 1))))).forEach((sentence, index) => { const important = Array.from(terms(sentence).keys())[0]; cards.push({ id: `card-${section.id}-${index}`, question: important ? `What does the document say about ${important}?` : `What is an important point in ${heading}?`, answer: sentence, sectionId: section.id, sectionTitle: heading, sourceExcerpt: sentence, difficulty: difficulty(sentence), createdAt: new Date().toISOString() }); }); }); return cards.slice(0, limit);
}

export function generateReviewQuestions(text: string, sections?: SoundocSection[], limit = 8): ReviewQuestion[] {
  const cards = generateFlashcards(text, sections, limit); return cards.map((card, index) => { const type: ReviewQuestion['type'] = index % 4 === 0 ? 'multiple-choice' : index % 4 === 1 ? 'true-false' : index % 4 === 2 ? 'short-answer' : 'recall'; const choices = type === 'multiple-choice' ? [card.answer, 'Not stated in this document', 'A different section describes this', 'The document leaves this unresolved'] : undefined; return { id: `review-${card.id}`, type, question: type === 'true-false' ? `True or false: ${card.answer}` : card.question, answer: type === 'true-false' ? 'True' : card.answer, choices, sectionId: card.sectionId, sourceExcerpt: card.sourceExcerpt, provider: 'local-extractive', isGenerative: false }; });
}

export function adaptiveChange(text: string, base: Pick<AdaptiveListeningChange, 'rate' | 'sentencePauseMs' | 'paragraphPauseMs'>): AdaptiveListeningChange {
  const value = cleanText(text); const dense = countWords(value) >= 35 || /\b(methods?|equation|algorithm|therefore|however|respectively|et al\.?|doi)\b/i.test(value); const heading = value.length < 90 && !/[.!?]$/.test(value);
  const rate = dense ? Math.max(0.72, base.rate * 0.94) : Math.min(2, base.rate); const sentencePauseMs = Math.round((dense ? base.sentencePauseMs * 1.2 : base.sentencePauseMs) + (heading ? 120 : 0)); const paragraphPauseMs = Math.round((dense ? base.paragraphPauseMs * 1.15 : base.paragraphPauseMs) + (heading ? 180 : 0));
  return { rate, sentencePauseMs, paragraphPauseMs, reason: dense ? 'Dense or technical passage: slightly slower with longer pauses.' : heading ? 'Heading detected: added a short orientation pause.' : 'Simple prose: keeping your selected pace.', appliedAt: new Date().toISOString() };
}

const ACADEMIC = ['abstract', 'introduction', 'methods', 'results', 'discussion', 'limitations', 'conclusion', 'references'];
export function academicSections(sections: SoundocSection[] = []) { return sections.map((section) => { const title = (section.title || '').toLowerCase(); const match = ACADEMIC.find((name) => title.includes(name)); return { ...section, academicType: match as typeof ACADEMIC[number] | undefined }; }); }
export function academicText(text: string, sections: SoundocSection[] | undefined, selected: string[] = ['abstract', 'introduction', 'results', 'discussion', 'limitations', 'conclusion']) { const normalized = academicSections(normalizeSections(text, sections)); return normalized.filter((section) => section.academicType ? selected.includes(section.academicType) : false); }

export type SpokenPreview = { original: string; spoken: string; removed: Array<{ text: string; reason: string }>; restorable: boolean };
export function compareOriginalAndSpoken(original: string, spoken: string): SpokenPreview { const originalLines = cleanText(original).split(/\n+/).filter(Boolean); const spokenValue = cleanText(spoken); const removed = originalLines.filter((line) => !spokenValue.toLowerCase().includes(line.toLowerCase())).map((line) => ({ text: line, reason: /https?:\/\//i.test(line) ? 'URL skipped by reading rules' : /^\[\d+(?:[-,]\d+)*\]$/.test(line) ? 'Citation skipped by reading rules' : 'Removed during document cleanup' })); return { original, spoken, removed, restorable: removed.length > 0 }; }

export function podcastScript(text: string, sections?: SoundocSection[], length: 'brief' | 'standard' | 'detailed' = 'standard'): PodcastScript { const limit = length === 'brief' ? 4 : length === 'detailed' ? 10 : 6; const passages = generateFlashcards(text, sections, limit); const turns: PodcastScript['turns'] = []; passages.forEach((card) => { turns.push({ speaker: 'Host', text: card.question, sectionId: card.sectionId }); turns.push({ speaker: 'Guest', text: card.answer, sectionId: card.sectionId }); }); return { title: 'Generated document summary', turns, provider: 'local-extractive', isGenerative: false, limitations: ['Extractive alternating key points; no dialogue facts were invented.', 'Two-voice playback requires the existing system voices and is not exported as audio.'], generatedAt: new Date().toISOString() }; }
