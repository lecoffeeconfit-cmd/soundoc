const WORDS_PER_MINUTE = 165;

export function cleanText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(^|\n)\s*(?:page\s*)?\d+\s*(?=\n|$)/gi, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '$&\n');
  return cleanText(withoutNoise
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>'));
}

export function suggestedTitle(text: string): string {
  const candidate = cleanText(text).split(/\n+/).find((line) => line.trim().length > 3) ?? 'Untitled note';
  return candidate.length > 72 ? `${candidate.slice(0, 69).trimEnd()}…` : candidate;
}

export function countWords(text: string): number {
  return cleanText(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

export function estimateSeconds(words: number, rate = 1): number {
  return Math.max(1, Math.round((words / WORDS_PER_MINUTE) * 60 / rate));
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `About ${hours} hr${hours === 1 ? '' : 's'}${remaining ? ` ${remaining} min` : ''}`;
}

export function detectLanguage(text: string): string {
  if (/[぀-ヿ㐀-鿿]/.test(text)) return 'ja-JP';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es-ES';
  if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) return 'fr-FR';
  return 'en-US';
}

export function segmentSentences(text: string, language = 'en-US'): string[] {
  const clean = cleanText(text);
  try {
    const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locale?: string, options?: { granularity: 'sentence' }) => { segment: (value: string) => Iterable<{ segment: string }> } }).Segmenter;
    if (Segmenter) return Array.from(new Segmenter(language, { granularity: 'sentence' }).segment(clean), ({ segment }) => segment.trim()).filter(Boolean);
  } catch { /* use the conservative fallback below */ }
  return clean.match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
}

export function safePublicUrl(value: string): URL | undefined {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    const privateHost = host === 'localhost' || host.endsWith('.local') || /^127\.|^0\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || host.includes(':');
    return (url.protocol === 'https:' || url.protocol === 'http:') && !privateHost ? url : undefined;
  } catch { return undefined; }
}
