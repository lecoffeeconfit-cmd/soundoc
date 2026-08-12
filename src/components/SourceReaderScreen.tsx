import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDocumentChunkCount, getDocumentChunkWindow } from '../lib/database';
import { getSourceLocation, originalSourceUrl, sourceTextForReader, sourceTypeLabel } from '../lib/sourceViewing';
import { colors, radius, shadows, space, type } from '../lib/theme';
import type { DocumentTextChunk, LibraryItem, PlayerState } from '../types';

const CHUNK_WINDOW_SIZE = 3;
const READER_BLOCK_LENGTH = 2600;

type ReaderBlock = { id: string; text: string; sectionTitle?: string; current?: boolean };
type MenuAction = { id: string; label: string; action: () => void };

type Props = {
  visible: boolean;
  item: LibraryItem | null;
  playerState: PlayerState;
  onTogglePlayback: () => void;
  onClose: () => void;
};

function splitReadableBlock(text: string) {
  if (text.length <= READER_BLOCK_LENGTH) return [text];
  const blocks: string[] = [];
  let remaining = text;
  while (remaining.length > READER_BLOCK_LENGTH) {
    const window = remaining.slice(0, READER_BLOCK_LENGTH);
    const boundary = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '), window.lastIndexOf(' '));
    const end = boundary > Math.floor(READER_BLOCK_LENGTH * 0.45) ? boundary + 1 : READER_BLOCK_LENGTH;
    blocks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) blocks.push(remaining);
  return blocks;
}

function blocksFromText(text: string, prefix: string, sectionTitle?: string): ReaderBlock[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return paragraphs.flatMap((paragraph, paragraphIndex) => splitReadableBlock(paragraph).map((part, partIndex) => ({
    id: `${prefix}-${paragraphIndex}-${partIndex}`,
    text: part,
    sectionTitle: paragraphIndex === 0 && partIndex === 0 ? sectionTitle : undefined,
  })));
}

function blocksFromChunks(chunks: DocumentTextChunk[], currentChunkIndex?: number): ReaderBlock[] {
  let previousSectionTitle: string | undefined;
  return chunks.flatMap((chunk) => {
    const showSectionTitle = chunk.sectionTitle && chunk.sectionTitle !== previousSectionTitle ? chunk.sectionTitle : undefined;
    previousSectionTitle = chunk.sectionTitle ?? previousSectionTitle;
    return blocksFromText(chunk.text, chunk.id, showSectionTitle).map((block, index) => ({ ...block, current: chunk.sequence === currentChunkIndex && index === 0 }));
  });
}

function locationText(item: LibraryItem, currentChunk?: DocumentTextChunk) {
  const location = getSourceLocation(item, currentChunk);
  if (location.sectionTitle) return `Currently listening · ${location.sectionTitle}`;
  return `Currently listening · ${Math.round(location.progress * 100)}% through`;
}

/** A bounded, read-only source view. It deliberately renders saved chunks instead of re-reading large files. */
export function SourceReaderScreen({ visible, item, playerState, onTogglePlayback, onClose }: Props) {
  const [chunkStart, setChunkStart] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const listRef = useRef<FlatList<ReaderBlock>>(null);
  const isChunked = item?.storageMode === 'chunked';

  useEffect(() => {
    if (!visible || !item) return;
    setMenuVisible(false);
    setChunkStart(Math.max(0, (item.currentChunkIndex ?? 0) - 1));
  }, [item?.id, visible]);

  const chunkCount = useMemo(() => isChunked && item ? getDocumentChunkCount(item.id) : 0, [isChunked, item?.id]);
  const chunks = useMemo(() => isChunked && item ? getDocumentChunkWindow(item.id, chunkStart, CHUNK_WINDOW_SIZE) : [], [chunkStart, isChunked, item?.id]);
  const currentChunk = chunks.find((chunk) => chunk.sequence === item?.currentChunkIndex);
  const savedText = item && !isChunked ? sourceTextForReader(item) : '';
  const blocks = useMemo(() => {
    if (!item) return [];
    return isChunked ? blocksFromChunks(chunks, item.currentChunkIndex) : blocksFromText(savedText, item.id);
  }, [chunks, isChunked, item, savedText]);
  const sourceUrl = item ? originalSourceUrl(item) : undefined;

  const moveChunkWindow = useCallback((nextStart: number) => {
    setChunkStart(Math.max(0, Math.min(Math.max(0, chunkCount - 1), nextStart)));
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [chunkCount]);

  const copyAll = useCallback(() => {
    if (!savedText) return;
    void Clipboard.setStringAsync(savedText).then(() => Alert.alert('Copied', 'The saved source text is ready to paste.')).catch(() => Alert.alert('Couldn’t copy', 'Please try again.'));
  }, [savedText]);

  const shareText = useCallback(() => {
    if (!savedText || !item) return;
    void Share.share({ title: item.title, message: savedText }).catch(() => undefined);
  }, [item, savedText]);

  const openOriginal = useCallback(() => {
    if (!sourceUrl) return;
    void Linking.openURL(sourceUrl).catch(() => Alert.alert('Couldn’t open the source', 'The original link is not available right now.'));
  }, [sourceUrl]);

  const shareOriginal = useCallback(() => {
    if (!sourceUrl || !item) return;
    void Share.share({ title: item.title, message: sourceUrl }).catch(() => undefined);
  }, [item, sourceUrl]);

  const menuActions: MenuAction[] = [
    ...(sourceUrl ? [{ id: 'open-original', label: 'Open original', action: openOriginal }, { id: 'share-link', label: 'Share link', action: shareOriginal }] : []),
    ...(!isChunked && savedText ? [{ id: 'copy-all', label: 'Copy all', action: copyAll }, { id: 'share-text', label: 'Share text', action: shareText }] : []),
  ];

  if (!item) return null;
  const hasReadableText = blocks.length > 0;
  const preparing = isChunked && ['queued', 'analyzing', 'processing', 'paused'].includes(item.processingStatus ?? '');
  const rangeEnd = chunks.at(-1)?.sequence ?? chunkStart;

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]} accessibilityRole="button" accessibilityLabel="Back to player" accessibilityHint="Returns to the same listening position"><Text style={styles.backChevron}>‹</Text><Text style={styles.backLabel}>Back</Text></Pressable>
        <View style={styles.headerTitleWrap}><Text style={styles.headerTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.headerSubtitle} numberOfLines={1}>{sourceTypeLabel(item)}</Text></View>
        {menuActions.length ? <Pressable onPress={() => setMenuVisible(true)} style={({ pressed }) => [styles.headerButton, styles.menuButton, pressed && styles.headerButtonPressed]} accessibilityRole="button" accessibilityLabel="Source actions"><Text style={styles.menuGlyph}>•••</Text></Pressable> : <View style={styles.menuPlaceholder} />}
      </View>

      <FlatList
        ref={listRef}
        data={blocks}
        keyExtractor={(block) => block.id}
        style={styles.readerList}
        contentContainerStyle={styles.readerContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: block }) => <View style={[styles.readerBlock, block.current && styles.currentReaderBlock]}>{block.sectionTitle ? <Text style={styles.readerSection}>{block.sectionTitle}</Text> : null}{block.current ? <Text style={styles.currentKicker}>CURRENTLY LISTENING</Text> : null}<Text selectable style={[styles.readerText, block.current && styles.currentReaderText]}>{block.text}</Text></View>}
        ListHeaderComponent={<View style={styles.readerIntro}><Text style={styles.readerKicker}>VIEWING SOURCE</Text><Text style={styles.readerLocation}>{locationText(item, currentChunk)}</Text>{isChunked && chunkCount ? <Text style={styles.readerWindowMeta}>Showing saved sections {chunkStart + 1}–{rangeEnd + 1} of {chunkCount}</Text> : null}</View>}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyTitle}>{preparing ? 'Source is still preparing' : 'Saved text isn’t available'}</Text><Text style={styles.emptyText}>{preparing ? 'Soundoc will make source sections available as it prepares this document.' : 'The original source is no longer available and there is no readable text saved for this item.'}</Text></View>}
        ListFooterComponent={isChunked && hasReadableText ? <View style={styles.windowControls}><Pressable disabled={chunkStart === 0} onPress={() => moveChunkWindow(Math.max(0, chunkStart - CHUNK_WINDOW_SIZE))} style={({ pressed }) => [styles.windowButton, chunkStart === 0 && styles.windowButtonDisabled, pressed && styles.windowButtonPressed]} accessibilityRole="button" accessibilityLabel="Show earlier saved text"><Text style={styles.windowButtonText}>‹ Earlier</Text></Pressable><Pressable disabled={rangeEnd >= chunkCount - 1} onPress={() => moveChunkWindow(rangeEnd + 1)} style={({ pressed }) => [styles.windowButton, rangeEnd >= chunkCount - 1 && styles.windowButtonDisabled, pressed && styles.windowButtonPressed]} accessibilityRole="button" accessibilityLabel="Show later saved text"><Text style={styles.windowButtonText}>Later ›</Text></Pressable></View> : <View style={styles.readerEnd} />}
      />

      <View style={styles.sourceMiniPlayer}><View style={styles.sourceMiniCopy}><Text style={styles.sourceMiniKicker}>{playerState === 'playing' ? 'PLAYING' : 'PAUSED'}</Text><Text style={styles.sourceMiniTitle} numberOfLines={1}>{item.title}</Text></View><Pressable onPress={onTogglePlayback} style={({ pressed }) => [styles.sourceMiniToggle, pressed && styles.sourceMiniTogglePressed]} accessibilityRole="button" accessibilityLabel={playerState === 'playing' ? 'Pause playback' : 'Play'}><Text style={styles.sourceMiniToggleIcon}>{playerState === 'playing' ? 'Ⅱ' : '▶'}</Text></Pressable></View>

      {menuVisible ? <View style={styles.menuOverlay}><Pressable style={styles.menuDismiss} onPress={() => setMenuVisible(false)} accessibilityLabel="Close source actions" /><View style={styles.actionSheet}><View style={styles.sheetHandle} /><Text style={styles.sheetTitle}>Source actions</Text>{menuActions.map((action) => <Pressable key={action.id} onPress={() => { setMenuVisible(false); action.action(); }} style={({ pressed }) => [styles.sheetAction, pressed && styles.sheetActionPressed]} accessibilityRole="button"><Text style={styles.sheetActionText}>{action.label}</Text><Text style={styles.sheetActionChevron}>›</Text></Pressable>)}<Pressable onPress={() => setMenuVisible(false)} style={styles.sheetCancel} accessibilityRole="button"><Text style={styles.sheetCancelText}>Cancel</Text></Pressable></View></View> : null}
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundPrimary },
  header: { minHeight: 58, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerButton: { minWidth: 62, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }, headerButtonPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] }, backChevron: { color: colors.textPrimary, fontSize: 29, lineHeight: 30, marginRight: 2 }, backLabel: { ...type.label, color: colors.textPrimary },
  headerTitleWrap: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: space.xs }, headerTitle: { ...type.label, color: colors.textPrimary, textAlign: 'center' }, headerSubtitle: { ...type.caption, color: colors.textTertiary, marginTop: 1, textAlign: 'center' }, menuButton: { justifyContent: 'flex-end' }, menuGlyph: { color: colors.textPrimary, letterSpacing: 2, fontSize: 16, paddingBottom: 5 }, menuPlaceholder: { minWidth: 62 },
  readerList: { flex: 1 }, readerContent: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: 108 }, readerIntro: { paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: space.sm }, readerKicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1, fontSize: 10 }, readerLocation: { ...type.label, color: colors.textPrimary, marginTop: 5 }, readerWindowMeta: { ...type.caption, color: colors.textTertiary, marginTop: 4 },
  readerBlock: { paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.medium }, currentReaderBlock: { marginTop: space.xs, marginBottom: space.xs, paddingLeft: 14, backgroundColor: 'rgba(255,113,56,0.08)', borderLeftWidth: 2, borderLeftColor: colors.accentPrimary }, readerSection: { ...type.heading, color: colors.textPrimary, fontSize: 20, lineHeight: 27, marginBottom: space.sm }, currentKicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 0.85, fontSize: 10, marginBottom: 5 }, readerText: { ...type.body, color: colors.textPrimary, fontSize: 18, lineHeight: 29 }, currentReaderText: { color: '#FFF8F4' },
  emptyState: { alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.xxxl }, emptyTitle: { ...type.title, color: colors.textPrimary, textAlign: 'center' }, emptyText: { ...type.body, color: colors.textSecondary, lineHeight: 21, textAlign: 'center', maxWidth: 360, marginTop: space.sm },
  windowControls: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.divider }, windowButton: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle, justifyContent: 'center' }, windowButtonDisabled: { opacity: 0.36 }, windowButtonPressed: { transform: [{ scale: 0.98 }], opacity: 0.8 }, windowButtonText: { ...type.label, color: colors.accentPrimary }, readerEnd: { height: space.lg },
  sourceMiniPlayer: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, minHeight: 66, paddingLeft: space.md, paddingRight: 9, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.11)', borderBottomColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', alignItems: 'center', ...shadows.raised }, sourceMiniCopy: { flex: 1, minWidth: 0 }, sourceMiniKicker: { ...type.caption, color: colors.accentPrimary, fontSize: 10, letterSpacing: 0.8 }, sourceMiniTitle: { ...type.label, color: colors.textPrimary, marginTop: 2 }, sourceMiniToggle: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center', marginLeft: space.sm }, sourceMiniTogglePressed: { transform: [{ scale: 0.94 }], opacity: 0.85 }, sourceMiniToggleIcon: { color: '#FFFFFF', fontSize: 18, paddingLeft: 1 },
  menuOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: 'rgba(7,9,11,0.62)' }, menuDismiss: { ...StyleSheet.absoluteFill }, actionSheet: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg, backgroundColor: colors.surfacePrimary, borderTopLeftRadius: radius.xlarge, borderTopRightRadius: radius.xlarge, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, sheetHandle: { width: 34, height: 4, borderRadius: radius.pill, alignSelf: 'center', backgroundColor: colors.textTertiary, opacity: 0.5 }, sheetTitle: { ...type.title, color: colors.textPrimary, marginTop: space.md, marginBottom: space.xs }, sheetAction: { minHeight: 56, paddingHorizontal: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.divider }, sheetActionPressed: { opacity: 0.68 }, sheetActionText: { ...type.label, color: colors.textPrimary }, sheetActionChevron: { color: colors.accentPrimary, fontSize: 25 }, sheetCancel: { minHeight: 52, marginTop: space.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, alignItems: 'center', justifyContent: 'center' }, sheetCancelText: { ...type.label, color: colors.textSecondary },
});
