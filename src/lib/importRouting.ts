export type DirectDocumentRoute = {
  extension: 'pdf' | 'docx' | 'txt' | 'md' | 'markdown' | 'epub' | 'rtf';
  fileName: string;
};

const supportedExtensions = new Set<DirectDocumentRoute['extension']>(['pdf', 'docx', 'txt', 'md', 'markdown', 'epub', 'rtf']);
const extensionByContentType: Record<string, DirectDocumentRoute['extension']> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/epub+zip': 'epub',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/rtf': 'rtf',
  'application/rtf': 'rtf',
};

function sanitiseName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 120);
}

function filenameFromDisposition(value?: string | null) {
  if (!value) return undefined;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = value.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
  try { return sanitiseName(decodeURIComponent(encoded ?? plain ?? '')); } catch { return sanitiseName(plain ?? ''); }
}

function extensionFromName(value?: string) {
  const extension = value?.split('.').pop()?.toLowerCase() as DirectDocumentRoute['extension'] | undefined;
  return extension && supportedExtensions.has(extension) ? extension : undefined;
}

/** Identifies public file URLs without treating regular article HTML as a file import. */
export function routeDirectDocument(url: URL, contentType?: string | null, contentDisposition?: string | null): DirectDocumentRoute | undefined {
  const dispositionName = filenameFromDisposition(contentDisposition);
  const extension = extensionFromName(dispositionName) ?? extensionFromName(url.pathname) ?? extensionByContentType[contentType?.split(';')[0].trim().toLowerCase() ?? ''];
  if (!extension) return undefined;
  const suppliedName = dispositionName || decodeURIComponent(url.pathname.split('/').pop() || '');
  const base = sanitiseName(suppliedName.replace(/\.[^.]*$/, '')) || 'document';
  return { extension, fileName: `${base}.${extension}` };
}

export function isHtmlResponse(contentType?: string | null) {
  return ['text/html', 'application/xhtml+xml'].includes(contentType?.split(';')[0].trim().toLowerCase() ?? '');
}
