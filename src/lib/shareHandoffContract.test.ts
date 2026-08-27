import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');

if (!appSource.includes('getResolvedSharedPayloadsAsync')) throw new Error('Share receiving must prefer resolved payload metadata for local files');
if (!appSource.includes("shared.kind === 'file'")) throw new Error('Document share payloads must enter the managed document handoff');
if (!appSource.includes("shared.kind === 'image'")) throw new Error('Image share payloads must enter the OCR review handoff');
if (!appSource.includes('beginSharedDocumentImport')) throw new Error('Shared documents must reuse a durable managed-storage import callback');
if (!appSource.includes('payloads.length > 1')) throw new Error('Multi-file shares must show the single-file limitation instead of silently dropping files');
if (!appSource.includes('PENDING_SHARED_LINK_STORAGE_KEY') || !appSource.includes('PENDING_SHARED_OCR_STORAGE_KEY')) throw new Error('Share drafts must survive app termination before user confirmation');
if (!appSource.includes('AsyncStorage.setItem') || !appSource.includes('AsyncStorage.getItem') || !appSource.includes('AsyncStorage.removeItem')) throw new Error('Share draft persistence must be written, restored, and cleared');
if (!appSource.includes('contentUri') || !appSource.includes('payload.value')) throw new Error('Malformed known file shares must receive terminal feedback');
if (!appSource.includes('Sharing.clearSharedPayloads()')) throw new Error('Native payloads must be cleared only after share handoff handling');
if (!appSource.includes('isGoogleSearchUrl')) throw new Error('Google search shares must be routed away from article extraction');
if (!appSource.includes('Paste copied answer')) throw new Error('Google search shares must offer a clipboard text fallback');

console.log('share handoff contract passed');
