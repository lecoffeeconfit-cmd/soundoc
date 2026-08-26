import { detectDocumentSections } from './chapterDetection';
import { suggestContentSections } from './sectionIntelligence';
import type { ItemType, LibraryItem, SoundocDocument, SoundocSection, SoundocSourceType } from '../types';

export function sectionsFromText(text: string, title?: string, options: { suggestSections?: boolean } = {}): SoundocSection[] {
  const detected = detectDocumentSections(text, title);
  if (!options.suggestSections || detected.length !== 1 || detected[0]?.kind === 'structural') return detected;
  const suggested = suggestContentSections(text);
  return suggested.length > 1 ? suggested : detected;
}

export function sourceTypeFor(itemType: ItemType, explicit?: SoundocSourceType): SoundocSourceType {
  if (explicit) return explicit;
  return itemType === 'article' ? 'url' : 'text';
}

export function libraryItemToDocument(item: LibraryItem): SoundocDocument {
  return { id: item.id, title: item.title, author: item.author, sourceUrl: item.sourceUrl, sourceDomain: item.source, sourceType: sourceTypeFor(item.type, item.sourceType), originalText: item.originalText, cleanedText: item.cleanedText ?? item.text, speakableText: item.speakableText, sections: item.sections ?? [{ id: 'document', title: item.title, level: 1, text: item.text, order: 0 }], wordCount: item.wordCount, language: item.language, extractionMethod: item.extractionMethod ?? 'legacy-library-item', extractionConfidence: item.extractionConfidence ?? 1, extractionWarnings: item.extractionWarnings ?? [], createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString(), lastOpenedAt: item.lastOpenedAt ? new Date(item.lastOpenedAt).toISOString() : undefined, completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : undefined };
}
