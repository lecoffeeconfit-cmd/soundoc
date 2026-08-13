import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, type } from '../lib/theme';
import { resolveRuntimeSpeechPreferences } from '../lib/listeningModes';
import { applyGoldenPreset } from '../lib/goldenListening';
import { canUndoGoldenAdjustment, goldenLearningSummary, goldenMeaningfulDifferences, goldenParameterStatus, goldenProfileStatus, type GoldenAdaptiveProfile } from '../lib/goldenPersonalization';
import type { LibraryItem, SpeechPreferences, Voice } from '../types';

type Props = { visible: boolean; enabled: boolean; preferences: SpeechPreferences; profile?: GoldenAdaptiveProfile | null; activeItem?: LibraryItem | null; voices: Voice[]; onClose: () => void; onReset: () => void; onUndo: () => void };

export function GoldenSettingsSheet({ visible, enabled, preferences, profile, activeItem, voices, onClose, onReset, onUndo }: Props) {
  const [showExactValues, setShowExactValues] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const goldenPreferences = enabled ? preferences : { ...preferences, ...applyGoldenPreset() };
  const effective = resolveRuntimeSpeechPreferences(goldenPreferences, activeItem, voices, profile);
  const baseline = resolveRuntimeSpeechPreferences({ ...goldenPreferences, ...applyGoldenPreset() }, activeItem, voices, null);
  const voice = voices.find((candidate) => candidate.identifier === effective.voiceIdentifier);
  const baselineVoice = voices.find((candidate) => candidate.identifier === baseline.voiceIdentifier);
  const differences = goldenMeaningfulDifferences(baseline, effective);
  const summary = goldenLearningSummary(profile);
  const status = goldenProfileStatus(profile);
  const reset = () => Alert.alert('Reset Golden Switch?', 'This removes what Golden Switch has learned and returns to Soundoc’s recommended settings. Your documents and other settings are unchanged.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: onReset }]);

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>Your Golden Switch Profile</Text><Text style={styles.subtitle}>Golden Switch learns the listening style you prefer while keeping Soundoc’s recommended settings as its foundation.</Text></View><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close Golden Switch Profile"><Text style={styles.done}>Done</Text></Pressable></View>
      {!enabled && <View style={styles.offNotice}><Text style={styles.noticeIcon}>✦</Text><Text style={styles.noticeText}>Golden Switch is currently off. These are the settings it will use when enabled.</Text></View>}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>CURRENT GOLDEN SWITCH SOUND</Text>
        <View style={styles.card}>
          <SettingRow label="Voice" value={voice?.name ?? 'Automatic · system fallback'} />
          <SettingRow label="Pace" value={`${paceDescription(effective.rate, baseline.rate)} · ${effective.rate.toFixed(2)}×`} />
          <SettingRow label="Pitch" value={`${pitchDescription(effective.pitch, baseline.pitch)} · ${effective.pitch.toFixed(2)}`} />
          <SettingRow label="Sentence Pauses" value={`${pauseDescription(effective.sentencePauseMs, baseline.sentencePauseMs)} · ${effective.sentencePauseMs} ms`} />
          <SettingRow label="Paragraph Pauses" value={`${pauseDescription(effective.paragraphPauseMs, baseline.paragraphPauseMs)} · ${effective.paragraphPauseMs} ms`} />
          <SettingRow label="Personalization Status" value={status} last />
        </View>

        <Text style={styles.sectionLabel}>WHAT GOLDEN SWITCH HAS LEARNED</Text>
        <View style={styles.learningCard}>{summary.learned.map((line) => <Text key={line} style={styles.learnedLine}>✓ {line}</Text>)}{summary.learning.map((line) => <Text key={line} style={styles.learningLine}>→ {line}</Text>)}{!summary.learned.length && !summary.learning.length && <Text style={styles.learningLine}>→ Still learning your listening preferences.</Text>}</View>
        {!!profile?.history.length && <><Text style={styles.sectionLabel}>LEARNING HISTORY</Text><View style={styles.historyCard}>{profile.history.slice(-5).reverse().map((entry, index) => <Text key={`${entry.at}-${index}`} style={styles.historyLine}>{historyIcon(entry.kind)} {entry.detail}</Text>)}</View></>}

        <Pressable style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]} onPress={() => setShowCompare((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: showCompare }} accessibilityLabel="Compare with Golden Switch Default"><View style={styles.disclosureCopy}><Text style={styles.disclosureTitle}>Compare with Golden Switch Default</Text><Text style={styles.disclosureHint}>{differences.length ? 'See only the settings Golden Switch has changed.' : 'No meaningful personalization yet.'}</Text></View><Text style={styles.chevron}>{showCompare ? '⌃' : '⌄'}</Text></Pressable>
        {showCompare && <View style={styles.compareCard}>{differences.length ? differences.map((difference) => <CompareRow key={difference.parameter} label={difference.label} baseline={difference.parameter === 'voice' ? baselineVoice?.name ?? 'System' : formatValue(difference.parameter, difference.baseline)} current={difference.parameter === 'voice' ? voice?.name ?? 'System' : formatValue(difference.parameter, difference.current)} />) : <Text style={styles.learningLine}>You’re currently using Soundoc’s recommended Golden Switch settings. Keep listening and rating Golden Switch and it will gently personalize them for you.</Text>}</View>}

        <Pressable style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]} onPress={() => setShowExactValues((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: showExactValues }} accessibilityLabel="Show exact values"><View style={styles.disclosureCopy}><Text style={styles.disclosureTitle}>{showExactValues ? 'Hide exact values' : 'Show exact values'}</Text><Text style={styles.disclosureHint}>Technical values from the effective Golden Switch configuration</Text></View><Text style={styles.chevron}>{showExactValues ? '⌃' : '⌄'}</Text></Pressable>
        {showExactValues && <ExactValues preferences={effective} voice={voice} profile={profile} />}

        {canUndoGoldenAdjustment(profile) && <Pressable style={({ pressed }) => [styles.undo, pressed && styles.pressed]} onPress={onUndo} accessibilityRole="button" accessibilityLabel="Undo Last Golden Switch Adjustment"><Text style={styles.undoIcon}>↶</Text><View style={styles.resetCopy}><Text style={styles.undoTitle}>Undo Last Adjustment</Text><Text style={styles.resetHint}>Return to the previous best-known Golden Switch sound</Text></View></Pressable>}
        <View style={styles.howCard}><Text style={styles.howTitle}>How Golden Switch gets better</Text><Text style={styles.howText}>Golden Switch starts with Soundoc’s recommended settings. You listen normally, occasionally choose Good or Not Quite, and Golden Switch tests one tiny supported adjustment at a time. It keeps a best-known profile and safely returns to it when an experiment does not work.</Text></View>
        <Pressable style={({ pressed }) => [styles.reset, pressed && styles.pressed]} onPress={reset} accessibilityRole="button" accessibilityLabel="Reset Golden Switch Profile"><Text style={styles.resetIcon}>↺</Text><View style={styles.resetCopy}><Text style={styles.resetTitle}>Reset Golden Switch Profile</Text><Text style={styles.resetHint}>Remove learned preferences and restore the baseline</Text></View><Text style={styles.chevron}>›</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function ExactValues({ preferences, voice, profile }: { preferences: SpeechPreferences; voice?: Voice; profile?: GoldenAdaptiveProfile | null }) {
  return <View style={styles.exactCard}><Text style={styles.exactTitle}>Exact values</Text><ValueRow label="Voice name" value={voice?.name ?? 'Automatic system voice'} /><ValueRow label="Voice identifier" value={voice?.identifier ?? 'System selected'} /><ValueRow label="Voice confidence" value={goldenParameterStatus(profile, 'voice')} /><ValueRow label="Speech rate" value={`${preferences.rate.toFixed(2)}× · ${goldenParameterStatus(profile, 'rate')}`} /><ValueRow label="Pitch" value={`${preferences.pitch.toFixed(2)} · ${goldenParameterStatus(profile, 'pitch')}`} /><ValueRow label="Volume" value={preferences.volume.toFixed(2)} /><ValueRow label="Sentence pause" value={`${preferences.sentencePauseMs} ms · ${goldenParameterStatus(profile, 'sentencePause')}`} /><ValueRow label="Paragraph pause" value={`${preferences.paragraphPauseMs} ms · ${goldenParameterStatus(profile, 'paragraphPause')}`} /><ValueRow label="Heading pause" value={`${preferences.headingPauseMs ?? 0} ms`} /></View>;
}

function SettingRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) { return <View style={[styles.settingRow, last && styles.lastRow]}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingValue} numberOfLines={2}>{value}</Text></View>; }
function ValueRow({ label, value }: { label: string; value: string }) { return <View style={styles.valueRow}><Text style={styles.valueLabel}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
function CompareRow({ label, baseline, current }: { label: string; baseline: string; current: string }) { return <View style={styles.compareRow}><Text style={styles.valueLabel}>{label}</Text><Text style={styles.compareValue}>{baseline} → {current}</Text></View>; }
function paceDescription(value: number, baseline: number) { return value > baseline + 0.005 ? 'Slightly Faster' : value < baseline - 0.005 ? 'Slightly Slower' : 'Balanced'; }
function pitchDescription(value: number, baseline: number) { return value > baseline + 0.005 ? 'Slightly Brighter' : value < baseline - 0.005 ? 'Slightly Softer' : 'Natural'; }
function pauseDescription(value: number, baseline: number) { return value > baseline + 5 ? 'Slightly Relaxed' : value < baseline - 5 ? 'Slightly Tighter' : 'Balanced'; }
function formatValue(parameter: string, value: number) { return parameter === 'rate' ? `${value.toFixed(2)}×` : parameter === 'pitch' ? value.toFixed(2) : `${Math.round(value)} ms`; }
function historyIcon(kind: string) { return kind === 'good' ? '✓' : kind === 'notQuite' || kind === 'undo' ? '↶' : '·'; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.xl },
  header: { paddingTop: space.md, paddingBottom: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  headerCopy: { flex: 1 },
  title: { ...type.display, color: colors.textPrimary, fontSize: 28 },
  subtitle: { ...type.caption, color: colors.textSecondary, marginTop: 5, maxWidth: 310, lineHeight: 18 },
  done: { ...type.label, color: colors.accentPrimary, padding: space.xs },
  content: { paddingBottom: space.xxxl, gap: space.md },
  offNotice: { padding: space.md, borderRadius: radius.medium, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  noticeIcon: { color: colors.accentPrimary, fontSize: 18 },
  noticeText: { ...type.caption, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  sectionLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 1, marginTop: space.xs },
  card: { borderRadius: radius.large, overflow: 'hidden', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle },
  settingRow: { minHeight: 54, paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  lastRow: { borderBottomWidth: 0 },
  settingLabel: { ...type.label, color: colors.textPrimary, flex: 1 },
  settingValue: { ...type.caption, color: colors.textSecondary, textAlign: 'right', flex: 1.3 },
  learningCard: { padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle, gap: space.xs },
  learnedLine: { ...type.label, color: colors.success, lineHeight: 20 },
  learningLine: { ...type.caption, color: colors.textSecondary, lineHeight: 18 },
  historyCard: { padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle, gap: space.xs },
  historyLine: { ...type.caption, color: colors.textSecondary, lineHeight: 18 },
  disclosure: { minHeight: 58, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  disclosureCopy: { flex: 1 },
  disclosureTitle: { ...type.label, color: colors.accentPrimary },
  disclosureHint: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  compareCard: { padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle, gap: space.sm },
  compareRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  compareValue: { ...type.caption, color: colors.textPrimary, textAlign: 'right', flex: 1.5 },
  exactCard: { padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle },
  exactTitle: { ...type.heading, color: colors.textPrimary, marginBottom: space.xs },
  valueRow: { minHeight: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  valueLabel: { ...type.caption, color: colors.textSecondary, flex: 1 },
  value: { ...type.caption, color: colors.textPrimary, textAlign: 'right', flex: 1.35 },
  howCard: { padding: space.md, borderRadius: radius.medium, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.recommendedGoldDark },
  howTitle: { ...type.heading, color: colors.recommendedGoldBright },
  howText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: space.xs },
  undo: { minHeight: 58, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.recommendedGoldDark, flexDirection: 'row', alignItems: 'center' },
  undoIcon: { width: 32, height: 32, borderRadius: radius.small, backgroundColor: colors.accentSoft, color: colors.recommendedGoldBright, fontSize: 22, lineHeight: 31, textAlign: 'center' },
  undoTitle: { ...type.label, color: colors.recommendedGoldBright },
  reset: { minHeight: 62, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', borderBottomColor: 'rgba(0,0,0,0.68)', flexDirection: 'row', alignItems: 'center' },
  resetIcon: { width: 32, height: 32, borderRadius: radius.small, backgroundColor: colors.accentSoft, color: colors.accentPrimary, fontSize: 23, lineHeight: 31, textAlign: 'center' },
  resetCopy: { flex: 1, marginLeft: space.sm },
  resetTitle: { ...type.label, color: colors.textPrimary },
  resetHint: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  chevron: { color: colors.accentPrimary, fontSize: 25, lineHeight: 28, marginLeft: space.sm },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
});
