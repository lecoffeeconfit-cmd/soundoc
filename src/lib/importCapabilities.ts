export type ImportCapability = { key: string; title: string; detail: string };

/** Keep user-facing import claims in one place so the UI cannot drift from the importer. */
export const IMPORT_PICKER_TYPES = [
  'text/plain', 'text/markdown', 'text/html', 'text/rtf', 'application/rtf',
  'application/pdf', 'application/epub+zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const IMPORT_CAPABILITIES: ImportCapability[] = [
  { key: 'PDF', title: 'PDF', detail: 'Articles, papers, textbooks, and selectable-text books' },
  { key: 'DOCX', title: 'DOCX', detail: 'Documents, manuscripts, and reports' },
  { key: 'TXT', title: 'TXT · Markdown', detail: 'Plain-text documents and long manuscripts' },
  { key: 'HTML', title: 'HTML · RTF', detail: 'Readable web exports and rich text' },
  { key: 'EPUB', title: 'EPUB', detail: 'Ebooks with chapter order preserved' },
  { key: 'WEB', title: 'Web / Article', detail: 'Public article links' },
];

export const LARGE_DOCUMENT_COPY = {
  title: 'Large documents',
  detail: 'Long files are prepared in sections to keep playback responsive and preserve your place.',
  verifiedPageCount: undefined as number | undefined,
};

export const SCANNED_PDF_COPY = 'Scanned or image-only PDFs are detected and kept safe. Automatic PDF OCR is not currently included.';

export function formatFileSize(bytes?: number) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return undefined;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}
