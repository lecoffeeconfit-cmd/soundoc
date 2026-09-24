import { Platform } from 'react-native';
import type { LegalDocument } from '../types/legal';

export const legalUrls: Record<Exclude<LegalDocument, null>, string> = {
  terms: Platform.OS === 'android' ? 'https://lecoffeeconfit-cmd.github.io/soundoc-legal/terms.html' : 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
  privacy: 'https://lecoffeeconfit-cmd.github.io/soundoc-legal/privacy.html',
};

export function getLegalUrl(document: Exclude<LegalDocument, null>) {
  return legalUrls[document];
}
