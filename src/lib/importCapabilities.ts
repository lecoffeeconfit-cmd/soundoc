export type ImportCapability = { key: string; title: string; detail: string; capacity: string };

/** Keep user-facing import claims in one place so the UI cannot drift from the importer. */
export const IMPORT_PICKER_TYPES = [
  'text/plain', 'text/markdown', 'text/html', 'text/rtf', 'application/rtf',
  'application/pdf', 'application/epub+zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const IMPORT_CAPABILITIES: ImportCapability[] = [
  { key: 'PDF', title: 'PDF', detail: 'Papers, textbooks, reports, and selectable-text books', capacity: 'Prepared in resume-safe sections' },
  { key: 'DOCX', title: 'DOCX', detail: 'Documents, manuscripts, and reports', capacity: 'Prepared in resume-safe sections' },
  { key: 'TXT', title: 'TXT · Markdown', detail: 'Plain-text documents and long manuscripts', capacity: 'Long manuscripts welcome' },
  { key: 'HTML', title: 'HTML · RTF', detail: 'Readable web exports and rich text', capacity: 'Prepared in resume-safe sections' },
  { key: 'EPUB', title: 'EPUB', detail: 'Ebooks with chapter order preserved', capacity: 'Chapters stay in reading order' },
  { key: 'WEB', title: 'Web Article or Link', detail: 'Articles and direct document links', capacity: 'Public pages and documents are handled separately' },
];

export const LARGE_DOCUMENT_COPY = {
  title: 'Large documents',
  detail: 'Books and large documents are prepared in sections so playback stays responsive and your place is preserved.',
  verifiedPageCount: undefined as number | undefined,
};

export const SCANNED_PDF_COPY = 'Scanned or image-only PDFs are detected and kept safe. Automatic PDF OCR is not currently included.';

export function formatFileSize(bytes?: number) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return undefined;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}
