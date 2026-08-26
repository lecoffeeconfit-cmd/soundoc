import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const config = JSON.parse(readFileSync(resolve(process.cwd(), 'app.json'), 'utf8')) as {
  expo?: { plugins?: Array<string | [string, Record<string, unknown>]> };
};
const sharingPlugin = config.expo?.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-sharing');
if (!Array.isArray(sharingPlugin)) throw new Error('expo-sharing config plugin is missing');
const options = sharingPlugin[1] as {
  ios?: { enabled?: boolean; appGroupId?: string; activationRule?: Record<string, unknown> };
  android?: { enabled?: boolean; singleShareMimeTypes?: string[] };
};
const activationRule = options.ios?.activationRule ?? {};
if (options.ios?.enabled !== true || options.ios.appGroupId !== 'group.com.lecoffeeconfit.soundoc') throw new Error('iOS Share Extension identity/settings changed');
for (const key of ['supportsWebPageWithMaxCount', 'supportsWebUrlWithMaxCount', 'supportsFileWithMaxCount', 'supportsAttachmentsWithMaxCount']) {
  if (activationRule[key] !== 1) throw new Error(`iOS activation rule must include ${key}=1`);
}
if (activationRule.supportsText !== true || activationRule.supportsImageWithMaxCount !== 1) throw new Error('iOS activation rule must retain text and accept one image');
const androidTypes = new Set(options.android?.singleShareMimeTypes ?? []);
for (const mimeType of ['text/plain', 'text/uri-list', 'text/markdown', 'text/html', 'text/rtf', 'application/rtf', 'application/pdf', 'application/epub+zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*']) {
  if (!androidTypes.has(mimeType)) throw new Error(`Android single-share MIME type missing: ${mimeType}`);
}
for (const mimeType of ['audio/*', 'video/*', 'application/zip']) {
  if (androidTypes.has(mimeType)) throw new Error(`Android must not advertise unsupported MIME type: ${mimeType}`);
}

console.log('share payload config contract passed');
