import assert from 'node:assert/strict';
import { normalizeIncomingSharePayload, normalizeIncomingSharePayloads } from './sharePayloads';

const cases = [
  {
    name: 'accepts a public URL payload',
    input: { shareType: 'url', value: 'https://example.com/articles/hello#comments' },
    expected: { kind: 'url', value: 'https://example.com/articles/hello#comments' },
  },
  {
    name: 'trims shared text',
    input: { shareType: 'text', value: '  Selected article text  ' },
    expected: { kind: 'text', value: 'Selected article text' },
  },
  {
    name: 'rejects blank values',
    input: { shareType: 'text', value: '   ' },
    expected: null,
  },
  {
    name: 'rejects private URLs',
    input: { shareType: 'url', value: 'http://localhost:3000/article' },
    expected: null,
  },
  {
    name: 'rejects unsupported payload types',
    input: { shareType: 'audio', value: 'file:///tmp/audio.mp3' },
    expected: null,
  },
  {
    name: 'normalizes a resolved document file',
    input: {
      shareType: 'file', value: 'file:///tmp/provider-token', mimeType: 'application/pdf',
      contentUri: 'file:///tmp/resolved-report.pdf', contentType: 'file', contentMimeType: 'application/pdf',
      originalName: 'Report.pdf', contentSize: 4096,
    },
    expected: { kind: 'file', uri: 'file:///tmp/resolved-report.pdf', name: 'Report.pdf', mimeType: 'application/pdf', size: 4096 },
  },
  {
    name: 'normalizes a resolved image file',
    input: {
      shareType: 'image', value: 'file:///tmp/provider-token', mimeType: 'image/png',
      contentUri: 'file:///tmp/resolved-photo.png', contentType: 'image', contentMimeType: 'image/png',
      originalName: 'Photo.png', contentSize: 2048,
    },
    expected: { kind: 'image', uri: 'file:///tmp/resolved-photo.png', name: 'Photo.png', mimeType: 'image/png', size: 2048 },
  },
  {
    name: 'uses resolved image content type for attachment payloads',
    input: {
      shareType: 'file', value: 'file:///tmp/provider-token', contentType: 'image', contentUri: 'file:///tmp/attachment.jpg',
      contentMimeType: 'image/jpeg', originalName: 'Attachment.jpg',
    },
    expected: { kind: 'image', uri: 'file:///tmp/attachment.jpg', name: 'Attachment.jpg', mimeType: 'image/jpeg' },
  },
  {
    name: 'keeps a resolved direct document URL on the existing URL path',
    input: {
      shareType: 'url', value: 'https://example.com/report.pdf', contentType: 'file',
      contentUri: 'file:///tmp/resolved-report.pdf', contentMimeType: 'application/pdf', originalName: 'Report.pdf',
    },
    expected: { kind: 'url', value: 'https://example.com/report.pdf' },
  },
  {
    name: 'accepts a resolved Android website share whose URL is in contentUri',
    input: {
      shareType: 'url', value: '', contentType: 'website',
      contentUri: 'https://example.com/articles/resolved-story',
    },
    expected: { kind: 'url', value: 'https://example.com/articles/resolved-story' },
  },
  {
    name: 'falls back to a raw file URI when resolution metadata is unavailable',
    input: { shareType: 'file', value: 'file:///tmp/report.pdf', mimeType: 'application/pdf' },
    expected: { kind: 'file', uri: 'file:///tmp/report.pdf', name: 'report.pdf', mimeType: 'application/pdf' },
  },
  {
    name: 'rejects a file without a usable URI',
    input: { shareType: 'file', value: '', mimeType: 'application/pdf', originalName: 'Report.pdf' },
    expected: null,
  },
  {
    name: 'accepts resolved content even when the raw value is blank',
    input: {
      shareType: 'file', value: '', contentUri: 'file:///tmp/resolved.txt',
      contentMimeType: 'text/plain', originalName: 'Notes.txt',
    },
    expected: { kind: 'file', uri: 'file:///tmp/resolved.txt', name: 'Notes.txt', mimeType: 'text/plain' },
  },
] as const;

cases.forEach(({ name, input, expected }) => {
  assert.deepEqual(normalizeIncomingSharePayload(input), expected, name);
});

console.log(`share payload fixtures passed (${cases.length})`);

assert.deepEqual(
  normalizeIncomingSharePayloads([
    { shareType: 'url', value: 'https://example.com/story' },
    { shareType: 'audio', value: 'file:///tmp/audio.mp3' },
    { shareType: 'text', value: 'A selected passage' },
    { shareType: 'file', value: 'file:///tmp/book.epub', mimeType: 'application/epub+zip', originalName: 'Book.epub' },
  ] as never),
  [
    { kind: 'url', value: 'https://example.com/story' },
    { kind: 'text', value: 'A selected passage' },
    { kind: 'file', uri: 'file:///tmp/book.epub', name: 'Book.epub', mimeType: 'application/epub+zip' },
  ],
  'filters a mixed incoming share batch'
);
