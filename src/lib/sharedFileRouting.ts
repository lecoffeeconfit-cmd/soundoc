import { MAX_EXTRACTABLE_DOCUMENT_BYTES, SUPPORTED_DOCUMENT_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS } from './importCapabilities';

type SharedFileInput = { name?: string | null; mimeType?: string | null; size?: number | null };

export type SharedFileRoute =
  | { kind: 'document'; fileName: string; mimeType?: string; size?: number }
  | { kind: 'image'; fileName: string; mimeType?: string; size?: number }
  | { kind: 'unsupported'; reason: 'too-large' | 'unsupported-type' };

const DOCUMENT_MIME_EXTENSIONS: Record<string, (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number]> = {
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html',
  'text/rtf': 'rtf',
  'application/rtf': 'rtf',
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

const IMAGE_MIME_EXTENSIONS: Record<string, (typeof SUPPORTED_IMAGE_EXTENSIONS)[number]> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
};

function cleanName(name: string | null | undefined) {
  const value = typeof name === 'string' ? name.trim() : '';
  const lastPathSegment = value.split(/[\\/]/).pop()?.trim() ?? '';
  if (!lastPathSegment) return '';
  try { return decodeURIComponent(lastPathSegment); } catch { return lastPathSegment; }
}

function extension(name: string) { return name.split('.').pop()?.toLowerCase() ?? ''; }
function normalizedMime(mimeType: string | null | undefined) { return typeof mimeType === 'string' ? mimeType.split(';', 1)[0].trim().toLowerCase() : ''; }

function addExtension(name: string, suffix: string, knownExtensions: readonly string[]) {
  if (knownExtensions.includes(extension(name))) return name;
  const base = name.replace(/\.[^.]*$/, '') || 'Shared file';
  return `${base}.${suffix}`;
}

export function routeSharedFile(input: SharedFileInput): SharedFileRoute {
  const mimeType = normalizedMime(input.mimeType);
  if (typeof input.size === 'number' && Number.isFinite(input.size) && input.size > MAX_EXTRACTABLE_DOCUMENT_BYTES) return { kind: 'unsupported', reason: 'too-large' };

  const suppliedName = cleanName(input.name);
  const documentMimeExtension = DOCUMENT_MIME_EXTENSIONS[mimeType];
  const imageMimeExtension = IMAGE_MIME_EXTENSIONS[mimeType];
  const imageMime = mimeType.startsWith('image/');
  const name = suppliedName || (imageMime ? 'Shared image' : documentMimeExtension ? 'Shared document' : 'Shared file');
  const nameExtension = extension(name);
  const documentByName = (SUPPORTED_DOCUMENT_EXTENSIONS as readonly string[]).includes(nameExtension);
  const imageByName = (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(nameExtension);

  if (documentMimeExtension) {
    const fileName = addExtension(name, documentMimeExtension, SUPPORTED_DOCUMENT_EXTENSIONS);
    return { kind: 'document', fileName, ...(mimeType ? { mimeType } : {}), ...(input.size !== undefined && input.size !== null ? { size: input.size } : {}) };
  }
  if (imageMime) {
    const fileName = addExtension(name, imageMimeExtension ?? 'jpg', SUPPORTED_IMAGE_EXTENSIONS);
    return { kind: 'image', fileName, ...(mimeType ? { mimeType } : {}), ...(input.size !== undefined && input.size !== null ? { size: input.size } : {}) };
  }
  if (documentByName) {
    return { kind: 'document', fileName: name, ...(mimeType ? { mimeType } : {}), ...(input.size !== undefined && input.size !== null ? { size: input.size } : {}) };
  }
  if (imageByName) {
    const fileName = imageByName ? name : addExtension(name, imageMimeExtension ?? 'jpg', SUPPORTED_IMAGE_EXTENSIONS);
    return { kind: 'image', fileName, ...(mimeType ? { mimeType } : {}), ...(input.size !== undefined && input.size !== null ? { size: input.size } : {}) };
  }
  return { kind: 'unsupported', reason: 'unsupported-type' };
}
