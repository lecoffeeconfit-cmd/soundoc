import { safePublicUrl } from './text';

export type IncomingSharePayload = {
  shareType?: string;
  value?: string | null;
  mimeType?: string | null;
  contentUri?: string | null;
  contentType?: string | null;
  contentMimeType?: string | null;
  originalName?: string | null;
  contentSize?: number | null;
};

export type NormalizedSharePayload =
  | { kind: 'url' | 'text'; value: string }
  | { kind: 'file' | 'image'; uri: string; name: string; mimeType?: string; size?: number };

function fileNameFromUri(uri: string, image: boolean) {
  const path = uri.split(/[?#]/, 1)[0];
  const rawName = path.slice(path.lastIndexOf('/') + 1).trim();
  if (!rawName) return image ? 'Shared image' : 'Shared file';
  try { return decodeURIComponent(rawName); } catch { return rawName; }
}

function normalizedFilePayload(payload: IncomingSharePayload, kind: 'file' | 'image'): NormalizedSharePayload | null {
  const uri = typeof payload.contentUri === 'string' && payload.contentUri.trim()
    ? payload.contentUri.trim()
    : typeof payload.value === 'string' && payload.value.trim()
      ? payload.value.trim()
      : '';
  if (!uri) return null;
  const mimeType = typeof payload.contentMimeType === 'string' && payload.contentMimeType.trim()
    ? payload.contentMimeType.trim().toLowerCase()
    : typeof payload.mimeType === 'string' && payload.mimeType.trim()
      ? payload.mimeType.trim().toLowerCase()
      : undefined;
  const size = typeof payload.contentSize === 'number' && Number.isFinite(payload.contentSize) && payload.contentSize >= 0
    ? payload.contentSize
    : undefined;
  const name = typeof payload.originalName === 'string' && payload.originalName.trim()
    ? payload.originalName.trim()
    : fileNameFromUri(uri, kind === 'image');
  return { kind, uri, name, ...(mimeType ? { mimeType } : {}), ...(size !== undefined ? { size } : {}) };
}

export function normalizeIncomingSharePayload(payload: IncomingSharePayload): NormalizedSharePayload | null {
  const value = typeof payload.value === 'string' ? payload.value.trim() : '';
  if (payload.shareType === 'url') {
    if (!value) return null;
    const url = safePublicUrl(value);
    return url ? { kind: 'url', value: url.toString() } : null;
  }
  if (payload.shareType === 'text') return value ? { kind: 'text', value } : null;
  if (payload.shareType === 'image' || payload.contentType === 'image') return normalizedFilePayload(payload, 'image');
  if (payload.shareType === 'file' || payload.contentType === 'file') return normalizedFilePayload(payload, 'file');
  return null;
}

export function normalizeIncomingSharePayloads(payloads: IncomingSharePayload[]): NormalizedSharePayload[] {
  return payloads.flatMap((payload) => {
    const normalized = normalizeIncomingSharePayload(payload);
    return normalized ? [normalized] : [];
  });
}
