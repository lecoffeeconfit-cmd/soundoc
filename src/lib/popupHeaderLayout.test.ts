import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const appSource = readFileSync(resolve(root, 'App.tsx'), 'utf8');
const sourceReaderSource = readFileSync(resolve(root, 'src/components/SourceReaderScreen.tsx'), 'utf8');
const popupSources = [
  'src/components/GoldenSettingsSheet.tsx',
  'src/components/ListeningModeSheet.tsx',
  'src/components/ListeningStudioScreen.tsx',
  'src/components/FeedbackCenter.tsx',
  'src/components/LegalModal.tsx',
  'src/components/SubscriptionPaywall.tsx',
  'src/components/SegmentedControlDial.tsx',
  'src/components/OnboardingModal.tsx',
  'src/screens/SettingsScreen.tsx',
].map((path) => readFileSync(resolve(root, path), 'utf8'));

if (!appSource.includes("playlistHeaderSpacer: { width: 44, flexShrink: 0 }")) throw new Error('Playlist popup header must reserve a standard back-button width');
if (!appSource.includes("playlistBack: { width: 44, height: 44, flexShrink: 0")) throw new Error('Playlist popup back button must remain fully visible inside its touch target');
if (!sourceReaderSource.includes("headerButton: { minWidth: 44, minHeight: 44, flexShrink: 0, paddingHorizontal: space.xs")) throw new Error('Source reader back button must use a compact standard touch target');
if (!sourceReaderSource.includes("menuPlaceholder: { minWidth: 44, flexShrink: 0 }")) throw new Error('Source reader header must keep both sides balanced');
if (!appSource.includes("modalHeaderCopy: { flex: 1, minWidth: 0, flexShrink: 1 }")) throw new Error('Shared popup headers must allow long titles to shrink');
if (!appSource.includes("modalHeaderAction: { minWidth: 56, minHeight: 44, flexShrink: 0")) throw new Error('Shared popup actions must keep a fully visible touch target');
for (const source of popupSources) {
  if (!source.includes("headerCopy: { flex: 1, minWidth: 0, flexShrink: 1 }")) throw new Error('Popup header copy must shrink before the close action');
  if (!source.includes("headerAction: { minWidth: 56, minHeight: 44, flexShrink: 0")) throw new Error('Popup header action must remain fully visible');
}
