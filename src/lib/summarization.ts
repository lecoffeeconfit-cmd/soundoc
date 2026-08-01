import type { SoundocSection, SummaryFormat, SummaryLength, SummaryRequest, SummaryResult } from '../types';
import { cleanText, countWords } from './text';

const STOP_WORDS = new Set('a an and are as at be by for from has have in is it its of on or that the their this to was were with into than then these those we you your our they he she his her about after before can could should would may might not only also over under'.split(' '));
const LIMITS: Record<SummaryLength, number> = { brief: 3, standard: 6, detailed: 10 };

export function contentHash(text: string) { let hash = 2166136261; for (const character of cleanText(text)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }

function sentences(text: string) { return cleanText(text).match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|$)/g)?.map((value) => value.trim()).filter((value) => value.length > 24) ?? []; }
function terms(text: string) { const frequencies = new Map<string, number>(); for (const word of text.toLowerCase().match(/[\p{L}][\p{L}\p{N}'’-]{2,}/gu) ?? []) if (!STOP_WORDS.has(word)) frequencies.set(word, (frequencies.get(word) ?? 0) + 1); return frequencies; }
function boilerplate(sentence: string) { return /^(home|menu|search|login|subscribe|share|download|cookie|copyright|privacy|terms|advertisement|related articles?)\b/i.test(sentence); }

function selectSentences(text: string, wanted: number, heading = '') {
  const all = sentences(text); if (!all.length) return [];
  const frequencies = terms(text); const headingTerms = terms(heading); const scored = all.map((sentence, index) => { const words = sentence.toLowerCase().match(/[\p{L}][\p{L}\p{N}'’-]{2,}/gu) ?? []; const termScore = words.reduce((sum, word) => sum + (frequencies.get(word) ?? 0), 0) / Math.max(1, words.length); const headingScore = words.reduce((sum, word) => sum + (headingTerms.has(word) ? 2 : 0), 0); const position = index === 0 ? 1.4 : index < 3 ? 1.2 : index / all.length < 0.75 ? 1 : 0.82; return { sentence, index, score: termScore * position + headingScore - (boilerplate(sentence) ? 10 : 0) }; }).sort((a, b) => b.score - a.score);
  const chosen: typeof scored = []; const overlap = (a: string, b: string) => { const left = new Set(a.toLowerCase().split(/\W+/).filter(Boolean)); const right = new Set(b.toLowerCase().split(/\W+/).filter(Boolean)); let shared = 0; left.forEach((word) => { if (right.has(word)) shared += 1; }); return shared / Math.max(1, Math.min(left.size, right.size)); };
  for (const candidate of scored) { if (chosen.every((entry) => overlap(entry.sentence, candidate.sentence) < 0.72)) chosen.push(candidate); if (chosen.length >= wanted) break; }
  return chosen.sort((a, b) => a.index - b.index).map((entry) => entry.sentence);
}

function splitSections(request: SummaryRequest): SoundocSection[] { return request.sections?.length ? request.sections : [{ id: 'document', title: request.title || 'Document', text: request.text, order: 0 }]; }
function sentenceSummary(text: string, limit: number) { const selected = selectSentences(text, limit); return selected.join(' '); }
function boundedChunks(text: string, maxWords = 450) { const chunks: string[] = []; let current: string[] = []; let words = 0; for (const sentence of sentences(text)) { const size = sentence.split(/\s+/).length; if (current.length && words + size > maxWords) { chunks.push(current.join(' ')); current = []; words = 0; } current.push(sentence); words += size; } if (current.length) chunks.push(current.join(' ')); return chunks.length ? chunks : [text]; }
function hierarchicalSectionSummary(text: string, heading: string, limit: number) { const chunks = boundedChunks(text); const chunkSummaries = chunks.map((chunk) => sentenceSummary(chunk, Math.max(1, Math.ceil(limit / chunks.length)))); return sentenceSummary(chunkSummaries.join(' '), limit) || chunkSummaries.filter(Boolean).join(' '); }
function keyPoints(text: string, length: SummaryLength) { return selectSentences(text, LIMITS[length] + 2).slice(0, length === 'brief' ? 3 : length === 'standard' ? 6 : 10); }
function importantTerms(text: string) { return Array.from(terms(text).entries()).filter(([, frequency]) => frequency > 1).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([term]) => ({ term, explanation: `The source repeatedly discusses ${term}.` })); }

export function summarizeExtractively(request: SummaryRequest): SummaryResult {
  const source = cleanText(request.text); const sections = splitSections(request); const lengthLimit = LIMITS[request.length]; const sectionSummaries = sections.filter((section) => section.text.trim()).map((section) => ({ sectionId: section.id, heading: section.title || 'Section', summary: hierarchicalSectionSummary(section.text, section.title || '', Math.max(1, Math.ceil(lengthLimit / Math.max(1, sections.length)))) })).filter((section) => section.summary);
  const overview = request.format === 'section-summary' ? sectionSummaries.slice(0, 3).map((section) => `${section.heading}: ${section.summary}`).join(' ') : sentenceSummary(source, request.length === 'brief' ? 2 : request.length === 'standard' ? 3 : 5) || source.slice(0, 480);
  const points = request.format === 'overview' ? keyPoints(source, request.length).slice(0, 5) : keyPoints(source, request.length);
  const limitations = ['Extractive summary — selected from the original text.'];
  if (countWords(source) < 80) limitations.push('The source is very short, so the summary may be close to the original.');
  if (sections.length > 1 && sectionSummaries.length < sections.length) limitations.push('Some sections did not contain enough complete sentences to summarize.');
  if (request.format === 'research-summary') limitations.push('Research headings are preserved when present; this summary does not infer causation or add outside findings.');
  return { provider: 'local-extractive', isGenerative: false, title: request.title ? `${request.title} — Summary` : 'Summary', overview, keyPoints: points, importantTerms: request.format === 'study-notes' ? importantTerms(source) : undefined, sectionSummaries: request.format === 'section-summary' || request.format === 'research-summary' ? sectionSummaries : undefined, limitations, generatedAt: new Date().toISOString(), sourceWordCount: countWords(source), contentHash: contentHash(source), format: request.format, length: request.length };
}

export async function summarizeDocument(request: SummaryRequest, onProgress?: (message: string) => void, signal?: { cancelled: boolean }) {
  const sections = splitSections(request); sections.forEach((_, index) => onProgress?.(`Summarizing section ${index + 1} of ${sections.length}`));
  if (signal?.cancelled) throw new Error('Summary cancelled.');
  const result = summarizeExtractively(request); onProgress?.('Saving summary'); return result;
}
