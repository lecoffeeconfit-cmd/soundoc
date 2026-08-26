import { MAX_EXTRACTABLE_DOCUMENT_BYTES } from './importCapabilities';
import { routeSharedFile } from './sharedFileRouting';

const documentCases = [
  ['notes.txt', 'text/plain'],
  ['notes.md', 'text/markdown'],
  ['notes.markdown', 'text/markdown'],
  ['page.html', 'text/html'],
  ['page.htm', 'text/html'],
  ['notes.rtf', 'application/rtf'],
  ['report.pdf', 'application/pdf'],
  ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['book.epub', 'application/epub+zip'],
] as const;

documentCases.forEach(([name, mimeType]) => {
  const route = routeSharedFile({ name, mimeType, size: 4096 });
  if (route.kind !== 'document' || route.fileName !== name) throw new Error(`${name} should route to the document importer`);
});

const mimeOnlyPdf = routeSharedFile({ name: 'download', mimeType: 'application/pdf' });
if (mimeOnlyPdf.kind !== 'document') throw new Error('MIME-only PDF shares should route to documents');
const mimeOnlyDocx = routeSharedFile({ name: 'download', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
if (mimeOnlyDocx.kind !== 'document' || mimeOnlyDocx.fileName !== 'download.docx') throw new Error('MIME-only DOCX shares should receive a DOCX filename');
const typedPdf = routeSharedFile({ name: 'download.bin', mimeType: 'application/pdf' });
if (typedPdf.kind !== 'document' || typedPdf.fileName !== 'download.pdf') throw new Error('document MIME types must replace unknown filename extensions');
const unnamedImage = routeSharedFile({ name: '', mimeType: 'image/png' });
if (unnamedImage.kind !== 'image' || unnamedImage.fileName !== 'Shared image.png') throw new Error('image shares without names should receive a safe image filename');
const typedImage = routeSharedFile({ name: 'attachment.pdf', mimeType: 'image/png' });
if (typedImage.kind !== 'image' || typedImage.fileName !== 'attachment.png') throw new Error('image MIME types must take precedence over misleading filename extensions');
if (routeSharedFile({ name: 'scan.jpeg', mimeType: undefined }).kind !== 'image') throw new Error('image extensions should route to OCR without a MIME type');
if (routeSharedFile({ name: 'scan', mimeType: 'image/heic' }).kind !== 'image') throw new Error('image MIME types should route to OCR without an extension');
if (routeSharedFile({ name: 'recording.mp4', mimeType: 'video/mp4' }).kind !== 'unsupported') throw new Error('video shares must remain unsupported');
if (routeSharedFile({ name: 'archive.zip', mimeType: 'application/zip' }).kind !== 'unsupported') throw new Error('archive shares must remain unsupported');
const tooLarge = routeSharedFile({ name: 'too-large.pdf', mimeType: 'application/pdf', size: MAX_EXTRACTABLE_DOCUMENT_BYTES + 1 });
if (tooLarge.kind !== 'unsupported' || tooLarge.reason !== 'too-large') throw new Error('oversized documents must be rejected before copying');

console.log(`shared file routing fixtures passed (${documentCases.length + 10})`);
