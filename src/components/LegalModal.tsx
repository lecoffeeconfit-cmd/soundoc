import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, type } from '../lib/theme';
import type { LegalDocument } from '../types/legal';

const privacySections = [
  ['Our approach', 'Soundoc is designed to work without an account. Your library, queue, listening position, settings, and imported text are stored locally on your device.'],
  ['Content you import', 'Text, document contents, bookmarks, and notes are not sent to a Soundoc server. When you import a public article link, your device requests that page directly from the original website so it can prepare a readable listening copy.'],
  ['Speech and recognition', 'Soundoc uses voices available on your device. Photo and camera text recognition is processed on-device by the installed recognition component. Soundoc does not use your imported content to train advertising or voice models.'],
  ['Information we do not collect', 'Soundoc does not require your name, email address, or an account. When you send feedback, it includes the message and the optional technical details shown in the form, but never the contents of your imported documents. Soundoc does not include behavioural advertising or third-party analytics.'],
  ['Your choices', 'You can delete saved items and clear your queue in the app at any time. Removing Soundoc from your device removes its app-contained data, subject to your device backup settings.'],
  ['Changes and contact', 'If this policy changes materially, the updated version will be available here with a new effective date. For privacy questions, use the contact method in Soundoc’s App Store listing.'],
];
const termsSections = [
  ['Using Soundoc', 'Soundoc is a private listening tool for content you have the right to access. You are responsible for the text, files, and links you import and for complying with applicable copyright, website, and subscription terms.'],
  ['The service', 'Soundoc provides local text preparation and device speech features. Some website, document, voice, and device capabilities may be unavailable or work differently depending on the source, your device, or operating-system settings.'],
  ['Your content', 'You retain ownership of content you import. Soundoc does not claim ownership of your documents or text. You may remove local items at any time.'],
  ['Acceptable use', 'Do not use Soundoc to bypass paywalls, digital rights management, access controls, or other restrictions. Do not use it in a way that infringes another person’s rights or violates applicable law.'],
  ['Disclaimers', 'Soundoc is provided on an “as available” basis. Listening-time estimates, article cleanup, text extraction, and speech pronunciation may not always be exact. Nothing in Soundoc is legal, medical, financial, or professional advice.'],
  ['Changes and contact', 'We may update these terms as Soundoc evolves. Continued use after an update means you accept the revised terms. For questions, use the contact method in Soundoc’s App Store listing.'],
];

export function LegalModal({ document, onClose }: { document: LegalDocument; onClose: () => void }) {
  if (!document) return null;
  const privacy = document === 'privacy';
  const sections = privacy ? privacySections : termsSections;
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.screen}><View style={styles.header}><View><Text style={styles.title}>{privacy ? 'Privacy Policy' : 'Terms of Service'}</Text><Text style={styles.effective}>EFFECTIVE JULY 30, 2026</Text></View><Pressable onPress={onClose}><Text style={styles.done}>Done</Text></Pressable></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}><View style={styles.intro}><Text style={styles.introMark}>⌁</Text><Text style={styles.introText}>{privacy ? 'Your listening stays personal.' : 'Clear terms for a simple listening tool.'}</Text></View>{sections.map(([heading, body]) => <View key={heading} style={styles.section}><Text style={styles.heading}>{heading}</Text><Text style={styles.body}>{body}</Text></View>)}</ScrollView></SafeAreaView></Modal>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.xl }, header: { paddingTop: space.md, paddingBottom: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, title: { ...type.display, color: colors.textPrimary, fontSize: 30 }, effective: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.75, marginTop: 5 }, done: { ...type.label, color: colors.accentPrimary }, scroll: { paddingBottom: space.xxxl }, intro: { padding: space.lg, backgroundColor: colors.accentSoft, borderRadius: radius.large, flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xxl }, introMark: { fontSize: 28, color: colors.accentPrimary }, introText: { ...type.heading, color: colors.accentPrimary, flex: 1 }, section: { marginBottom: space.xl }, heading: { ...type.heading, color: colors.textPrimary, marginBottom: space.xs }, body: { ...type.body, color: colors.textSecondary } });
