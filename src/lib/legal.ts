import type { LegalDocument } from '../types/legal';

export const legalUrls: Record<Exclude<LegalDocument, null>, string> = {
  terms: 'https://lecoffeeconfit-cmd.github.io/soundoc-legal/terms.html',
  privacy: 'https://lecoffeeconfit-cmd.github.io/soundoc-legal/privacy.html',
};

export function getLegalUrl(document: Exclude<LegalDocument, null>) {
  return legalUrls[document];
}
