import { classifyDocumentLength, estimateDocumentPages, formatDocumentPages, hasExactPageCount } from './documentMetrics';
import { routeDirectDocument } from './importRouting';

export function runDocumentImportFixtures() {
  const failures: string[] = [];
  const expect = (condition: unknown, message: string) => { if (!condition) failures.push(message); };
  expect(estimateDocumentPages(475) === 1, '475 words should estimate to one page');
  expect(estimateDocumentPages(476) === 2, 'page estimates should round up');
  expect(estimateDocumentPages(475_000) === 1_000, 'a book-sized 475,000-word fixture should estimate to 1,000 pages');
  expect(classifyDocumentLength({ pageCount: 900 }) === 'veryLong', '900 pages should be very long');
  expect(formatDocumentPages(12, false) === '~12 pages', 'estimated page label should be marked');
  expect(hasExactPageCount('pdf') && !hasExactPageCount('epub'), 'only PDFs should claim exact pages');
  expect(routeDirectDocument(new URL('https://example.com/guide.pdf'))?.fileName === 'guide.pdf', 'PDF links should route as documents');
  expect(routeDirectDocument(new URL('https://example.com/download'), 'application/epub+zip')?.fileName === 'download.epub', 'content type should route extensionless book links');
  expect(routeDirectDocument(new URL('https://example.com/download'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'attachment; filename="semester-notes.docx"')?.fileName === 'semester-notes.docx', 'disposition names should preserve direct DOCX imports');
  expect(!routeDirectDocument(new URL('https://example.com/article'), 'text/html'), 'HTML pages should remain article imports');
  if (failures.length) throw new Error(failures.join('\n'));
}
