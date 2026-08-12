import { getSourceLocation, originalSourceUrl, shouldOpenOriginalWebPage, sourceTextForReader, sourceTypeLabel } from './sourceViewing';
import type { LibraryItem } from '../types';

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const baseItem: LibraryItem = {
  id: 'source-test', type: 'text', title: 'Saved note', text: 'Fallback text', language: 'en-US', wordCount: 2,
  createdAt: 1, updatedAt: 1, sentenceIndex: 0, progress: 0.42, rate: 1, pitch: 1, completed: false,
};

expect(sourceTextForReader({ ...baseItem, originalText: 'Original paste', cleanedText: 'Cleaned paste' }) === 'Original paste', 'original pasted text takes precedence');
expect(sourceTypeLabel({ ...baseItem, sourceType: 'text' }) === 'Pasted text', 'pasted text has a friendly label');
expect(originalSourceUrl({ ...baseItem, sourceUrl: 'javascript:alert(1)' }) === undefined, 'unsafe URL is rejected');
expect(originalSourceUrl({ ...baseItem, sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1/' }) === 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1/', 'public source URL is preserved');
expect(shouldOpenOriginalWebPage({ ...baseItem, type: 'article', sourceType: 'url', sourceUrl: 'https://example.com/article' }), 'articles use their original public webpage');
expect(!shouldOpenOriginalWebPage({ ...baseItem, type: 'document', sourceType: 'pdf', sourceUrl: 'https://example.com/file.pdf' }), 'PDFs remain in Soundoc reader');
expect(getSourceLocation({ ...baseItem, currentSectionId: 'methods', sections: [{ id: 'methods', title: 'Methods', text: 'Method text', order: 1 }] }).sectionTitle === 'Methods', 'section metadata is used without fabricating a page');
