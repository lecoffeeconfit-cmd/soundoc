import { Platform } from 'react-native';
import type { GroundedAnswer, PassageExplanation, SummaryAvailability, SummaryRequest, SummaryResult } from '../types';
import { summarizeDocument } from './summarization';

type NativeSummaryModule = { getCapabilities?: () => Promise<SummaryAvailability>; summarize?: (request: SummaryRequest) => Promise<SummaryResult>; askDocument?: (request: { question: string; passages: string[]; language?: string }) => Promise<GroundedAnswer>; explainPassage?: (request: { passage: string; language?: string }) => Promise<PassageExplanation>; cancel?: () => Promise<void> };
let nativeModule: NativeSummaryModule | null | undefined;
function loadNativeModule() {
  if (nativeModule !== undefined) return nativeModule;
  try {
    // Optional development-build module. Expo Go and unsupported builds safely use the local provider.
    const modules = require('expo-modules-core') as { requireNativeModule?: (name: string) => NativeSummaryModule };
    nativeModule = modules.requireNativeModule?.('SoundocSummarization') ?? null;
  } catch { nativeModule = null; }
  return nativeModule;
}

export async function getSummaryCapabilities(): Promise<SummaryAvailability> {
  const native = loadNativeModule();
  if (native?.getCapabilities) { try { return await native.getCapabilities(); } catch { /* Use the offline provider when native inference is unavailable. */ } }
  return { available: true, provider: 'local-extractive', reason: Platform.OS === 'ios' ? 'On-device Foundation Models are unavailable in this build or on this device.' : 'On-device generative summarization is unavailable in this build or on this device.' };
}

export async function summarizeWithBestProvider(request: SummaryRequest, onProgress?: (message: string) => void, signal?: { cancelled: boolean }) {
  const native = loadNativeModule();
  if (native?.summarize) { try { return await native.summarize(request); } catch { /* Never send text to a cloud service; fall back locally. */ } }
  return summarizeDocument(request, onProgress, signal);
}

export async function cancelSummary() { try { await loadNativeModule()?.cancel?.(); } catch { /* Cancellation is best effort for optional native providers. */ } }
export async function askDocumentWithBestProvider(request: { question: string; passages: string[]; language?: string }, fallback: () => GroundedAnswer) { const native = loadNativeModule(); if (native?.askDocument) { try { return await native.askDocument(request); } catch { /* Fall back without sending content to a server. */ } } return fallback(); }
export async function explainPassageWithBestProvider(request: { passage: string; language?: string }, fallback: () => PassageExplanation) { const native = loadNativeModule(); if (native?.explainPassage) { try { return await native.explainPassage(request); } catch { /* Fall back to local term extraction. */ } } return fallback(); }
export function getProviderName(provider: SummaryResult['provider']) { return provider === 'apple-foundation-model' ? 'Generated privately on this iPhone' : provider === 'android-mlkit' ? 'Generated on-device with Android' : 'Extractive summary created locally'; }
export function getPrivacyDescription() { return 'Supported summaries are generated on your device. When on-device generation is unavailable, Soundoc creates an extractive summary from sentences already in the document. Document text is not sent to an external AI service.'; }
