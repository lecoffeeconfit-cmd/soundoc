import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, space, type } from '../lib/theme';
import { SoundocToggle } from './SoundocToggle';

type Props = {
  enabled: boolean;
  clearMode?: boolean;
  integrated?: boolean;
  reduceEffects?: boolean;
  onValueChange: (value: boolean) => void;
  onOpenInspector?: () => void;
  onPreview?: (onFinished?: () => void) => void;
  onStopPreview?: () => void;
};

/** The one special control in Settings: a tactile recommendation switch with an audible sample. */
export function RecommendedListeningSwitch({ enabled, clearMode = false, integrated = false, reduceEffects = false, onValueChange, onOpenInspector, onPreview, onStopPreview }: Props) {
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    onStopPreview?.();
  }, [onStopPreview]);

  useEffect(() => {
    if (enabled || !previewing) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    onStopPreview?.();
    setPreviewing(false);
  }, [enabled, onStopPreview, previewing]);

  const stopPreview = () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = null;
    onStopPreview?.();
    setPreviewing(false);
  };

  const togglePreview = (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    if (previewing) {
      stopPreview();
      return;
    }
    onPreview?.(() => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = null;
      setPreviewing(false);
    });
    setPreviewing(true);
    previewTimer.current = setTimeout(() => {
      previewTimer.current = null;
      setPreviewing(false);
    }, 6500);
  };

  const toggleDetails = (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    if (detailsOpen) {
      stopPreview();
    }
    setDetailsOpen((current) => !current);
  };

  return <View style={[styles.card, enabled && styles.cardEnabled, integrated && styles.cardIntegrated]}>
    <View style={styles.header}>
      <View style={[styles.iconWell, enabled && styles.iconWellEnabled]}><Text style={[styles.icon, enabled && styles.iconEnabled]}>✦</Text></View>
      <View style={styles.copy}>
        <View style={styles.titleRow}><Text style={styles.title}>Golden Switch</Text><Text style={styles.badgeText}>RECOMMENDED</Text>{onOpenInspector && <Pressable onPress={(event) => { event.stopPropagation(); onOpenInspector(); }} hitSlop={8} style={styles.infoButton} accessibilityRole="button" accessibilityLabel="Open Golden Switch Settings" accessibilityHint="Shows the settings Golden Switch is currently using"><Text style={styles.infoText}>ⓘ</Text></Pressable>}</View>
      </View>
    </View>
    <View style={styles.compactRow}>
      <Pressable onPress={toggleDetails} style={({ pressed }) => [styles.detailsDisclosure, pressed && styles.previewPressed]} accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} accessibilityLabel={detailsOpen ? 'Hide Golden Switch details' : 'Show Golden Switch details'} accessibilityHint="Shows how Golden Switch adapts the voice and pace"><View style={styles.detailsDisclosureCopy}><Text style={styles.detailsDisclosureTitle}>{detailsOpen ? 'Hide details' : 'How Golden Switch works'}</Text><Text style={styles.detailsDisclosureHint}>{enabled ? (clearMode ? 'Clear Mode active' : 'Adapts as you listen') : 'Tap the switch to enable'}</Text></View><Text style={styles.detailsDisclosureChevron}>{detailsOpen ? '⌃' : '⌄'}</Text></Pressable>
      <SoundocToggle value={enabled} onValueChange={onValueChange} compact accentColor={colors.recommendedGold} onTrackColor="#4A3B1D" reduceEffects={reduceEffects} accessibilityLabel={`Golden Switch${clearMode ? ', Clear Mode' : ', Recommended'}`} accessibilityHint={`Double tap to turn ${enabled ? 'off' : 'on'}`} />
    </View>
    {detailsOpen && <View style={styles.detailsPanel}><Text style={styles.detailsLabel}>WHAT IT CHANGES</Text><Text style={styles.description}>{clearMode ? 'Adds extra space and clarity for dense material while keeping your chosen voice.' : enabled ? 'Keeps the reading calm, removes common source clutter, and can fine-tune the pace from your feedback.' : 'Combines a clear voice, balanced pauses, and automatic source cleanup in one setting.'}</Text>{onPreview ? <Pressable onPress={togglePreview} style={({ pressed }) => [styles.previewButton, previewing && styles.previewButtonActive, pressed && styles.previewPressed]} accessibilityRole="button" accessibilityLabel={previewing ? 'Stop Golden Switch sample' : 'Hear a Golden Switch sample'} accessibilityHint="Previews the voice and pacing without changing your listening settings"><Text style={[styles.previewGlyph, previewing && styles.previewGlyphActive]}>{previewing ? 'Ⅱ' : '▶'}</Text><View style={styles.previewCopy}><Text style={[styles.previewTitle, previewing && styles.previewTitleActive]}>{previewing ? 'Playing sample' : 'Hear a sample'}</Text><Text style={styles.previewHint}>{previewing ? 'Tap to stop' : 'Preview the Golden sound'}</Text></View></Pressable> : null}<Text style={[styles.resolved, enabled && styles.resolvedEnabled]}>{enabled ? `${clearMode ? 'Active · Clear Mode' : 'Active'} · Soundoc will use this automatically` : 'Off · use the switch above to turn it on'}</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: space.sm, borderRadius: radius.large, backgroundColor: 'rgba(255,184,107,0.07)', borderWidth: 1, borderColor: 'rgba(255,184,107,0.18)', borderTopColor: 'rgba(255,184,107,0.3)', borderBottomColor: 'rgba(0,0,0,0.72)', ...shadows.raised },
  cardEnabled: { backgroundColor: 'rgba(255,184,107,0.13)', borderColor: colors.recommendedGoldDark, borderTopColor: colors.recommendedGoldDark, borderBottomColor: colors.recommendedGoldDark, shadowColor: colors.recommendedGold, shadowOpacity: 0.18, shadowRadius: 15 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconWell: { width: 36, height: 36, borderRadius: radius.small, backgroundColor: 'rgba(255,184,107,0.1)', borderWidth: 1, borderColor: 'rgba(255,184,107,0.28)', borderTopColor: 'rgba(255,184,107,0.42)', borderBottomColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  iconWellEnabled: { backgroundColor: 'rgba(255,184,107,0.16)', borderColor: colors.recommendedGoldDark },
  icon: { color: colors.recommendedGold, fontSize: 19 },
  iconEnabled: { color: colors.recommendedGoldBright },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 1 },
  infoText: { color: colors.recommendedGoldBright, fontSize: 17, lineHeight: 20 },
  title: { ...type.heading, color: colors.textPrimary },
  badgeText: { ...type.caption, color: colors.recommendedGoldBright, fontSize: 9, lineHeight: 15, letterSpacing: 0.7, fontWeight: '700' },
  detailsLabel: { ...type.caption, color: colors.recommendedGoldBright, fontSize: 9, lineHeight: 13, letterSpacing: 0.8, fontWeight: '700' },
  description: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 4 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  detailsDisclosure: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.64)', flexDirection: 'row', alignItems: 'center', gap: space.xs },
  detailsDisclosureCopy: { flex: 1, minWidth: 0 },
  detailsDisclosureTitle: { ...type.label, color: colors.textPrimary },
  detailsDisclosureHint: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  detailsDisclosureChevron: { color: colors.textTertiary, fontSize: 18, lineHeight: 20, width: 18, textAlign: 'center' },
  detailsPanel: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  previewButton: { minHeight: 50, marginTop: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.64)', flexDirection: 'row', alignItems: 'center', gap: space.xs },
  previewButtonActive: { backgroundColor: 'rgba(255,184,107,0.14)', borderColor: colors.recommendedGoldDark },
  previewPressed: { transform: [{ scale: 0.985 }], opacity: 0.88 },
  previewGlyph: { width: 30, color: colors.recommendedGoldBright, fontSize: 17, textAlign: 'center' },
  previewGlyphActive: { color: colors.textPrimary },
  previewCopy: { flex: 1, minWidth: 0 },
  previewTitle: { ...type.label, color: colors.textPrimary },
  previewTitleActive: { color: colors.recommendedGoldBright },
  previewHint: { ...type.caption, color: colors.textTertiary, marginTop: 2, lineHeight: 15 },
  resolved: { ...type.caption, color: colors.textTertiary, marginTop: space.sm, lineHeight: 16 },
  resolvedEnabled: { color: colors.recommendedGold },
  cardIntegrated: { marginTop: 0, borderWidth: 0, borderRadius: 0, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
});
