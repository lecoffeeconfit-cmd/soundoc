import type { DocumentTextChunk, LibraryItem } from '../types';
import { safePublicUrl } from './text';

export type SourceLocation = {
  sectionTitle?: string;
  chunkIndex?: number;
  textOffset?: number;
  progress: number;
};

/** Only returns a public HTTP(S) URL that has already passed Soundoc's URL safety rules. */
export function originalSourceUrl(item: LibraryItem) {
  return item.sourceUrl ? safePublicUrl(item.sourceUrl)?.toString() : undefined;
}

/** Articles retain their canonical webpage; imported files stay in Soundoc's reader. */
export function shouldOpenOriginalWebPage(item: LibraryItem) {
  return item.type === 'article' && item.sourceType === 'url' && Boolean(originalSourceUrl(item));
}

export function sourceTypeLabel(item: LibraryItem) {
  switch (item.sourceType) {
    case 'pdf': return 'PDF';
    case 'docx': return 'Word document';
    case 'epub': return 'EPUB';
    case 'html': return 'HTML document';
    case 'image': return 'Scanned text';
    case 'scan': return 'Scanned text';
    case 'shared': return 'Shared text';
    case 'url': return 'Web article';
    case 'text': return item.type === 'text' ? 'Pasted text' : 'Text document';
    default: return item.type === 'article' ? 'Article' : item.type === 'document' ? 'Document' : 'Pasted text';
  }
}

/** Pasted text keeps its originally saved characters; cleaned text is the safe fallback for legacy items. */
export function sourceTextForReader(item: LibraryItem) {
  return item.originalText?.trim() ? item.originalText : item.cleanedText?.trim() ? item.cleanedText : item.text;
}

/** Maps only persisted playback metadata back to source context; it never estimates a page number. */
export function getSourceLocation(item: LibraryItem, currentChunk?: DocumentTextChunk): SourceLocation {
  const sectionTitle = currentChunk?.sectionTitle ?? item.sections?.find((section) => section.id === item.currentSectionId)?.title;
  return {
    sectionTitle,
    chunkIndex: currentChunk?.sequence ?? item.currentChunkIndex,
    textOffset: currentChunk?.sourceStart,
    progress: Math.max(0, Math.min(1, item.progress)),
  };
}
