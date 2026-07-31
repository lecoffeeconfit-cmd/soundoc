import { useState } from 'react';
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from '../lib/theme';

export function OnboardingModal({ onDone }: { onDone: () => void }) {
  const [page, setPage] = useState(0);
  const slides = [
    { mark: '▤', title: 'Listen to anything', body: 'Paste text, add a link, or upload a document.' },
    { mark: '⌁', title: 'Private and unlimited', body: 'Soundoc uses voices already available on your iPhone. No account or listening credits.' },
    { mark: '☷', title: 'Your listening queue', body: 'Save articles and documents, then listen whenever you have time.' },
  ];
  const slide = slides[page];
  return <Modal visible animationType="fade" onRequestClose={onDone}><SafeAreaView style={styles.screen}><View style={styles.top}><Text style={styles.brand}>Soundoc</Text><Pressable onPress={onDone}><Text style={styles.skip}>Skip</Text></Pressable></View><View style={styles.center}><View style={styles.mark}><Text style={styles.glyph}>{slide.mark}</Text><Text style={styles.wave}>⌁</Text></View><Text style={styles.title}>{slide.title}</Text><Text style={styles.body}>{slide.body}</Text></View><View><View style={styles.dots}>{slides.map((_, index) => <View key={index} style={[styles.dot, index === page && styles.activeDot]} />)}</View><Pressable style={styles.button} onPress={() => page === slides.length - 1 ? onDone() : setPage((value) => value + 1)}><Text style={styles.buttonText}>{page === slides.length - 1 ? 'Start listening' : 'Continue'}</Text><Text style={styles.arrow}>›</Text></Pressable></View></SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundPrimary, padding: space.xl, justifyContent: 'space-between' }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brand: { ...type.title, color: colors.textPrimary, letterSpacing: -0.8 }, skip: { ...type.label, color: colors.textSecondary, padding: space.xs }, center: { alignItems: 'center', paddingHorizontal: space.md, marginTop: -30 }, mark: { width: 112, height: 112, borderRadius: 36, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xxl }, glyph: { color: colors.accentPrimary, fontSize: 52 }, wave: { position: 'absolute', color: colors.accentSecondary, fontSize: 24, right: 14, bottom: 17 }, title: { ...type.display, color: colors.textPrimary, textAlign: 'center', fontSize: 34, lineHeight: 40 }, body: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.md, maxWidth: 310 }, dots: { alignSelf: 'center', flexDirection: 'row', gap: 7, marginBottom: space.lg }, dot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.borderSubtle }, activeDot: { width: 22, backgroundColor: colors.accentPrimary }, button: { height: 57, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, flexDirection: 'row' }, buttonText: { ...type.heading, color: '#FFFFFF' }, arrow: { color: '#FFFFFF', fontSize: 28 },
});
