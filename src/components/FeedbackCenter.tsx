import * as Clipboard from 'expo-clipboard';
import * as MailComposer from 'expo-mail-composer';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SkeuoSwitch } from './SkeuoSwitch';
import { FEEDBACK_CATEGORIES, FEEDBACK_RATINGS, FEEDBACK_RECIPIENT, buildFeedbackEmail } from '../lib/feedback';
import { colors, radius, shadows, space, type } from '../lib/theme';
import type { FeedbackCategory, FeedbackRating } from '../lib/feedback';

const minimumFeedbackLength = 8;
const maximumFeedbackLength = 3000;

export function FeedbackCenter({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<FeedbackRating>();
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [validation, setValidation] = useState('');
  const [preparing, setPreparing] = useState(false);

  const resetAndClose = () => { setCategory(null); setMessage(''); setRating(undefined); setIncludeDiagnostics(true); setValidation(''); onClose(); };
  const requestClose = () => {
    if (!message.trim()) { resetAndClose(); return; }
    Alert.alert('Discard feedback?', 'Your message has not been sent yet.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: resetAndClose }]);
  };
  const email = () => buildFeedbackEmail({ category: category!, message, rating, includeDiagnostics, openedFrom: 'Settings' });
  const copyAddress = async () => { await Clipboard.setStringAsync(FEEDBACK_RECIPIENT); Alert.alert('Email copied', 'Paste it into any email app to contact Soundoc support.'); };
  const copyFeedback = async () => { await Clipboard.setStringAsync(email().body); Alert.alert('Feedback copied', 'Your feedback message is ready to paste into an email.'); };
  const showUnavailable = () => Alert.alert('Email Isn’t Available', 'Soundoc couldn’t open an email app on this device.', [{ text: 'Copy address', onPress: () => { void copyAddress(); } }, { text: 'Copy feedback', onPress: () => { void copyFeedback(); } }, { text: 'Cancel', style: 'cancel' }]);

  const send = async () => {
    if (!category) { setValidation('Choose a feedback category so we can route your note.'); return; }
    if (message.trim().length < minimumFeedbackLength) { setValidation('Tell us a little more so we can understand what happened.'); return; }
    setValidation('');
    setPreparing(true);
    try {
      if (!await MailComposer.isAvailableAsync()) { showUnavailable(); return; }
      const draft = email();
      const result = await MailComposer.composeAsync({ recipients: [FEEDBACK_RECIPIENT], subject: draft.subject, body: draft.body, isHtml: false });
      if (result.status === MailComposer.MailComposerStatus.SENT) {
        setCategory(null); setMessage(''); setRating(undefined); setIncludeDiagnostics(true);
        Alert.alert('Feedback sent', 'Thanks for helping improve Soundoc.');
      } else if (result.status === MailComposer.MailComposerStatus.SAVED) {
        Alert.alert('Draft saved', 'Your feedback was saved in your email app and has not been sent yet.');
      }
      // A cancelled composer intentionally leaves the in-app draft untouched.
    } catch {
      showUnavailable();
    } finally { setPreparing(false); }
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}>
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.kicker}>SOUNDOC SUPPORT</Text><Text style={styles.title}>Feedback</Text><Text style={styles.subtitle}>Help us improve Soundoc. Report a problem, suggest a feature, or tell us about your experience.</Text></View><Pressable onPress={requestClose} hitSlop={8} style={styles.done} accessibilityRole="button" accessibilityLabel="Close feedback"><Text style={styles.doneText}>Done</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>WHAT CAN WE HELP WITH?</Text>
          <View style={styles.categoryList}>{FEEDBACK_CATEGORIES.map((entry) => <Pressable key={entry.id} onPress={() => { setCategory(entry.id); setValidation(''); }} style={({ pressed }) => [styles.category, category === entry.id && styles.categorySelected, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: category === entry.id }} accessibilityLabel={entry.label}>
            <View style={[styles.categoryIcon, category === entry.id && styles.categoryIconSelected]}><Text style={[styles.categoryGlyph, category === entry.id && styles.categoryGlyphSelected]}>{entry.icon}</Text></View><View style={styles.grow}><Text style={[styles.categoryTitle, category === entry.id && styles.categoryTitleSelected]}>{entry.label}</Text><Text style={styles.categoryDetail}>{entry.detail}</Text></View>{category === entry.id && <Text style={styles.check}>✓</Text>}
          </Pressable>)}</View>

          <View style={styles.ratingBlock}><Text style={styles.sectionLabel}>HOW IS SOUNDOC WORKING FOR YOU? <Text style={styles.optional}>OPTIONAL</Text></Text><View style={styles.ratingRow}>{FEEDBACK_RATINGS.map((option) => <Pressable key={option} onPress={() => setRating(option)} style={[styles.rating, rating === option && styles.ratingSelected]} accessibilityRole="radio" accessibilityState={{ selected: rating === option }}><Text style={[styles.ratingText, rating === option && styles.ratingTextSelected]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{option}</Text></Pressable>)}</View></View>

          <View style={styles.messageCard}><Text style={styles.fieldLabel}>TELL US MORE</Text><TextInput value={message} onChangeText={(value) => { setMessage(value); if (validation) setValidation(''); }} multiline maxLength={maximumFeedbackLength} textAlignVertical="top" placeholder="Describe what happened, what you expected, or what you’d like Soundoc to improve…" placeholderTextColor={colors.textTertiary} style={styles.messageInput} accessibilityLabel="Tell us more" accessibilityHint="Describe your feedback" />
            <View style={styles.messageFooter}>{validation ? <Text style={styles.validation}>{validation}</Text> : <Text style={styles.messageHint}>Please don’t include document text or private information.</Text>}<Text style={styles.characterCount}>{message.length} / {maximumFeedbackLength}</Text></View>
          </View>

          <View style={styles.diagnosticsCard}><View style={styles.diagnosticsHeader}><View style={styles.grow}><Text style={styles.diagnosticsTitle}>Include diagnostic information</Text><Text style={styles.diagnosticsText}>Includes basic app and device information that can help diagnose problems. It does not include your document text or listening content.</Text></View><SkeuoSwitch value={includeDiagnostics} onValueChange={setIncludeDiagnostics} accessibilityLabel="Include diagnostic information" /></View></View>
          <View style={styles.emailNote}><Text style={styles.emailNoteIcon}>✉</Text><Text style={styles.emailNoteText}>You’ll review and send the email from your preferred mail app. It goes to Soundoc support.</Text></View>
        </ScrollView>
        <View style={styles.footer}><Pressable onPress={() => void send()} disabled={preparing || message.trim().length < minimumFeedbackLength} style={({ pressed }) => [styles.send, (preparing || message.trim().length < minimumFeedbackLength) && styles.sendDisabled, pressed && !preparing && styles.pressed]} accessibilityRole="button" accessibilityLabel="Send feedback"><Text style={styles.sendText}>{preparing ? 'Preparing email…' : 'Send Feedback'}</Text><Text style={styles.sendArrow}>›</Text></Pressable></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundPrimary }, keyboard: { flex: 1 }, header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md, flexDirection: 'row', alignItems: 'flex-start', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, headerCopy: { flex: 1, minWidth: 0 }, kicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1 }, title: { ...type.display, color: colors.textPrimary, fontSize: 29, lineHeight: 35, marginTop: 2 }, subtitle: { ...type.caption, color: colors.textSecondary, lineHeight: 19, marginTop: 5 }, done: { minHeight: 44, paddingHorizontal: space.xs, alignItems: 'flex-end', justifyContent: 'center' }, doneText: { ...type.label, color: colors.accentPrimary },
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.xl }, sectionLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.85 }, optional: { color: colors.textTertiary, fontSize: 9 }, categoryList: { borderRadius: radius.large, overflow: 'hidden', backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', borderBottomColor: 'rgba(0,0,0,0.65)', ...shadows.raised }, category: { minHeight: 70, paddingHorizontal: space.md, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, categorySelected: { backgroundColor: colors.accentSoft }, categoryIcon: { width: 36, height: 36, borderRadius: radius.small, backgroundColor: colors.surfaceInset, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderSubtle }, categoryIconSelected: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary }, categoryGlyph: { color: colors.accentPrimary, fontSize: 17, fontWeight: '700' }, categoryGlyphSelected: { color: '#fff' }, grow: { flex: 1, minWidth: 0 }, categoryTitle: { ...type.label, color: colors.textPrimary }, categoryTitleSelected: { color: colors.accentPrimary }, categoryDetail: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, check: { color: colors.accentPrimary, fontSize: 19, fontWeight: '800' }, pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  ratingBlock: { gap: space.sm }, ratingRow: { flexDirection: 'row', gap: space.xs }, rating: { flex: 1, minWidth: 0, minHeight: 42, paddingHorizontal: 5, borderRadius: radius.small, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center', justifyContent: 'center' }, ratingSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentPrimary }, ratingText: { ...type.caption, color: colors.textSecondary, fontSize: 10 }, ratingTextSelected: { color: colors.accentPrimary },
  messageCard: { padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle }, fieldLabel: { ...type.caption, color: colors.accentPrimary, letterSpacing: 0.9 }, messageInput: { minHeight: 154, marginTop: space.sm, padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.66)', borderBottomColor: 'rgba(255,255,255,0.07)', color: colors.textPrimary, ...type.body }, messageFooter: { minHeight: 22, marginTop: 6, flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }, messageHint: { ...type.caption, color: colors.textTertiary, lineHeight: 16, flex: 1 }, validation: { ...type.caption, color: colors.error, lineHeight: 16, flex: 1 }, characterCount: { ...type.caption, color: colors.textTertiary, fontSize: 10 },
  diagnosticsCard: { padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle }, diagnosticsHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md }, diagnosticsTitle: { ...type.label, color: colors.textPrimary }, diagnosticsText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 3 }, emailNote: { paddingHorizontal: space.xs, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }, emailNoteIcon: { color: colors.accentPrimary, fontSize: 18 }, emailNoteText: { ...type.caption, color: colors.textTertiary, lineHeight: 18, flex: 1 },
  footer: { padding: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, backgroundColor: colors.backgroundPrimary }, send: { minHeight: 56, paddingHorizontal: space.lg, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...shadows.floating }, sendDisabled: { opacity: 0.48 }, sendText: { ...type.heading, color: '#fff' }, sendArrow: { color: '#fff', fontSize: 28 },
});
