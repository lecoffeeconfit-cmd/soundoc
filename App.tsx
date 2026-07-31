import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { getTextFromFrame } from 'expo-text-recognition';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, SafeAreaView,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { initializeDatabase, listItems, listQueueIds, removeItem, saveItem, saveQueueIds } from './src/lib/database';
import { importDocument } from './src/lib/importers';
import { cleanText, countWords, detectLanguage, estimateSeconds, formatDuration, htmlToText, safePublicUrl, segmentSentences, suggestedTitle } from './src/lib/text';
import { colors, radius, space, type } from './src/lib/theme';
import { copy } from './src/lib/strings';
import { useSpeechPlayer } from './src/hooks/useSpeechPlayer';
import type { ItemType, LibraryItem } from './src/types';
import type { LegalDocument } from './src/types/legal';
import { LegalModal } from './src/components/LegalModal';
import { OnboardingModal } from './src/components/OnboardingModal';
import { SettingsScreen } from './src/screens/SettingsScreen';

type Screen = 'home' | 'library' | 'settings' | 'player';
type ImportMode = 'text' | 'link' | null;
type Prepared = { item: LibraryItem; message: string } | null;

const speedOptions = [0.75, 1, 1.25, 1.5, 1.75, 2];
const sampleText = 'Welcome to Soundoc. Your iPhone can read articles, notes, and documents aloud using a voice already on your device.';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>(null);
  const [draftText, setDraftText] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepared, setPrepared] = useState<Prepared>(null);
  const [showControls, setShowControls] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [reduceEffects, setReduceEffects] = useState(false);

  useEffect(() => {
    initializeDatabase();
    setItems(listItems());
    setQueueIds(listQueueIds());
    void AsyncStorage.getItem('soundoc.onboarding.complete').then((value) => setOnboardingComplete(value === 'true'));
  }, []);

  const persist = useCallback((next: LibraryItem) => {
    saveItem(next);
    setItems((current) => [next, ...current.filter((item) => item.id !== next.id)].sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);
  const player = useSpeechPlayer(persist);

  const continueItem = useMemo(() => items.find((item) => item.progress > 0 && !item.completed) ?? items[0], [items]);
  const recentItems = useMemo(() => items.slice(0, 5), [items]);
  const queue = useMemo(() => queueIds.map((id) => items.find((item) => item.id === id)).filter((item): item is LibraryItem => Boolean(item)), [items, queueIds]);

  const updateQueue = useCallback((nextIds: string[]) => {
    const unique = Array.from(new Set(nextIds));
    saveQueueIds(unique); setQueueIds(unique);
  }, []);
  const addToQueue = useCallback((item: LibraryItem, playNext = false) => {
    setQueueIds((current) => {
      const withoutItem = current.filter((id) => id !== item.id);
      const next = playNext ? [item.id, ...withoutItem] : [...withoutItem, item.id];
      saveQueueIds(next); return next;
    });
  }, []);

  useEffect(() => {
    if (player.state !== 'completed' || !player.item || queueIds[0] !== player.item.id) return;
    const nextIds = queueIds.slice(1);
    updateQueue(nextIds);
    const next = items.find((item) => item.id === nextIds[0]);
    if (next) player.load(next, true);
  }, [items, player, queueIds, updateQueue]);

  const openImport = (mode: ImportMode) => {
    setDraftText(''); setDraftLink(''); setDraftTitle(''); setImportMode(mode);
  };

  const makeItem = (text: string, itemType: ItemType, title?: string, source?: string): LibraryItem => {
    const cleaned = cleanText(text);
    const now = Date.now();
    return {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`, type: itemType,
      title: title?.trim() || suggestedTitle(cleaned), source, text: cleaned,
      language: detectLanguage(cleaned), wordCount: countWords(cleaned), createdAt: now, updatedAt: now,
      sentenceIndex: 0, progress: 0, rate: 1, pitch: 1, completed: false,
    };
  };

  const acceptShareHandoff = useCallback((incomingUrl: string | null) => {
    if (!incomingUrl) return;
    const { path, hostname, queryParams } = Linking.parse(incomingUrl);
    if (path !== 'import' && hostname !== 'import') return;
    const sharedText = typeof queryParams?.text === 'string' ? queryParams.text : undefined;
    const sharedUrl = typeof queryParams?.url === 'string' ? queryParams.url : undefined;
    if (sharedText?.trim()) {
      const item = makeItem(sharedText, 'text');
      persist(item); setPrepared({ item, message: 'Shared text is ready to listen.' });
    } else if (sharedUrl) {
      setDraftLink(sharedUrl); setImportMode('link');
    }
  }, [persist]);

  useEffect(() => {
    void Linking.getInitialURL().then(acceptShareHandoff);
    const subscription = Linking.addEventListener('url', ({ url }) => acceptShareHandoff(url));
    return () => subscription.remove();
  }, [acceptShareHandoff]);

  const prepareText = () => {
    const text = cleanText(draftText);
    if (!text) { Alert.alert('Add some text first', 'Paste or type something you want to listen to.'); return; }
    const item = makeItem(text, 'text', draftTitle);
    persist(item); setImportMode(null); setPrepared({ item, message: 'Cleaned and ready to listen.' });
  };

  const pasteFromClipboard = async () => {
    const value = await Clipboard.getStringAsync();
    if (value.trim()) {
      setDraftText(value);
      if (!draftTitle) setDraftTitle(suggestedTitle(value));
    } else Alert.alert('Nothing to paste', 'Copy some text, then try again.');
  };

  const prepareLink = async () => {
    const url = safePublicUrl(draftLink);
    if (!url) { Alert.alert('Use a public web link', 'Soundoc can open regular http or https article links, but not local or private addresses.'); return; }
    setIsPreparing(true);
    try {
      const response = await fetch(url.toString(), { redirect: 'follow' });
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || !contentType.includes('text/html')) throw new Error('not-readable');
      const html = await response.text();
      if (html.length > 5_000_000) throw new Error('too-large');
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || url.hostname;
      const text = htmlToText(html);
      if (countWords(text) < 25) throw new Error('not-readable');
      const item = makeItem(text, 'article', title, url.hostname);
      persist(item); setImportMode(null); setPrepared({ item, message: `Cleaned from ${url.hostname} and ready to listen.` });
    } catch {
      Alert.alert('Couldn’t find a clean article', 'This page may require a sign-in, be paywalled, or not contain a readable article. Try pasting the article text instead.');
    } finally { setIsPreparing(false); }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'text/markdown', 'text/html', 'text/rtf', 'application/rtf', 'application/pdf', 'application/epub+zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    setIsPreparing(true);
    try {
      const imported = await importDocument(asset.uri, asset.name, asset.size);
      const item = makeItem(imported.text, 'document', imported.title || asset.name.replace(/\.[^.]+$/, ''));
      persist(item); setPrepared({ item, message: 'Document prepared and ready to listen.' });
    } catch (error) { Alert.alert('Couldn’t read this file', error instanceof Error ? error.message : 'Choose a text-based PDF, TXT, Markdown, HTML, RTF, DOCX, or EPUB file.'); }
    finally { setIsPreparing(false); }
  };

  const importImageText = async (source: 'library' | 'camera') => {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { Alert.alert('Camera access is needed', 'Allow camera access to scan text on this iPhone.'); return; }
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled) return;
    setIsPreparing(true);
    try {
      const lines = await getTextFromFrame(result.assets[0].uri);
      const text = cleanText(lines.join('\n'));
      if (countWords(text) < 2) throw new Error('No readable text was found in that image.');
      const item = makeItem(text, 'document', source === 'camera' ? 'Scanned text' : 'Text from photo');
      persist(item); setPrepared({ item, message: 'Text found on your iPhone and ready to listen.' });
    } catch (error) {
      Alert.alert('Couldn’t read that image', error instanceof Error ? error.message : 'Try a sharper image with clearer text.');
    } finally { setIsPreparing(false); }
  };

  const playPrepared = () => {
    if (!prepared) return;
    player.load(prepared.item, true); setPrepared(null); setScreen('player');
  };
  const openItem = (item: LibraryItem, autoplay = false) => { player.load(item, autoplay); setScreen('player'); };
  const finishOnboarding = () => { void AsyncStorage.setItem('soundoc.onboarding.complete', 'true'); setOnboardingComplete(true); };
  const showOnboardingAgain = () => setOnboardingComplete(false);
  const openQueueItem = (item: LibraryItem) => { player.load(item, true); setShowQueue(false); setScreen('player'); };
  const deleteItem = (item: LibraryItem) => Alert.alert('Delete this item?', 'Its saved text and listening position will be removed from Soundoc.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { removeItem(item.id); setItems((all) => all.filter((entry) => entry.id !== item.id)); updateQueue(queueIds.filter((id) => id !== item.id)); if (player.item?.id === item.id) player.pause(); } },
  ]);
  const itemActions = (item: LibraryItem) => Alert.alert(item.title, undefined, [
    { text: 'Play next', onPress: () => addToQueue(item, true) },
    { text: 'Save for later', onPress: () => addToQueue(item) },
    { text: 'Delete', style: 'destructive', onPress: () => deleteItem(item) },
    { text: 'Cancel', style: 'cancel' },
  ]);

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      {screen === 'home' && <HomeScreen items={recentItems} continueItem={continueItem} queue={queue} onOpenQueue={() => setShowQueue(true)} onImport={openImport} onUpload={pickDocument} onPhoto={() => importImageText('library')} onCamera={() => importImageText('camera')} onContinue={() => continueItem && openItem(continueItem, true)} onOpen={openItem} />}
      {screen === 'library' && <LibraryScreen items={items} onOpen={openItem} onDelete={itemActions} />}
      {screen === 'settings' && <SettingsScreen reduceEffects={reduceEffects} onReduceEffects={setReduceEffects} onShowQueue={() => setShowQueue(true)} onShowOnboarding={showOnboardingAgain} onOpenLegal={setLegalDocument} />}
      {screen === 'player' && <PlayerScreen player={player} onClose={() => setScreen('home')} showControls={showControls} setShowControls={setShowControls} showVoicePicker={showVoicePicker} setShowVoicePicker={setShowVoicePicker} />}

      {screen !== 'player' && player.item && <MiniPlayer item={player.item} state={player.state} onPress={() => setScreen('player')} onToggle={() => player.state === 'playing' ? player.pause() : player.play()} />}
      {screen !== 'player' && <TabBar screen={screen} onChange={setScreen} miniPlayer={Boolean(player.item)} />}

      <ImportModal mode={importMode} text={draftText} link={draftLink} title={draftTitle} busy={isPreparing} onText={setDraftText} onLink={setDraftLink} onTitle={setDraftTitle} onClose={() => setImportMode(null)} onPaste={pasteFromClipboard} onSubmit={importMode === 'text' ? prepareText : prepareLink} />
      <PreparedModal prepared={prepared} onClose={() => setPrepared(null)} onPlay={playPrepared} onPlayNext={() => { if (prepared) addToQueue(prepared.item, true); setPrepared(null); }} onAddToQueue={() => { if (prepared) addToQueue(prepared.item); setPrepared(null); }} />
      <QueueModal visible={showQueue} items={queue} onClose={() => setShowQueue(false)} onOpen={openQueueItem} onRemove={(item) => updateQueue(queueIds.filter((id) => id !== item.id))} onClear={() => updateQueue([])} />
      <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />
      {onboardingComplete === false && <OnboardingModal onDone={finishOnboarding} />}
      {isPreparing && <View style={styles.loadingOverlay}><ActivityIndicator color="#fff" size="large" /><Text style={styles.loadingText}>Preparing your listening copy…</Text></View>}
    </SafeAreaView>
  );
}

function HomeScreen({ items, continueItem, queue, onOpenQueue, onImport, onUpload, onPhoto, onCamera, onContinue, onOpen }: { items: LibraryItem[]; continueItem?: LibraryItem; queue: LibraryItem[]; onOpenQueue: () => void; onImport: (mode: ImportMode) => void; onUpload: () => void; onPhoto: () => void; onCamera: () => void; onContinue: () => void; onOpen: (item: LibraryItem) => void }) {
  return <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.brandRow}><View><Text style={styles.brandMark}>Soundoc</Text><Text style={styles.eyebrow}>PRIVATE LISTENING</Text></View><View style={styles.privacy}><Text style={styles.privacyIcon}>⌁</Text><Text style={styles.privacyText}>On your iPhone</Text></View></View>
    <Text style={styles.display}>{copy.homeTitle}</Text><Text style={styles.intro}>{copy.homeSubtitle}</Text>
    <View style={styles.importGroup}>
      <ImportButton symbol="T" title="Paste Text" description="Listen to copied or written text" onPress={() => onImport('text')} primary />
      <ImportButton symbol="↗" title="Paste Link" description="Turn a public article into clean audio" onPress={() => onImport('link')} />
      <ImportButton symbol="⌁" title="Upload Document" description="PDF, Word, EPUB, RTF and more" onPress={onUpload} />
    </View>
    <View style={styles.otherImports}><Text style={styles.otherImportsLabel}>OR USE YOUR CAMERA</Text><View style={styles.otherImportActions}><Pressable style={styles.otherImportButton} onPress={onCamera} accessibilityLabel="Scan text with camera"><Text style={styles.otherImportIcon}>⌗</Text><Text style={styles.otherImportText}>Scan pages</Text></Pressable><Pressable style={styles.otherImportButton} onPress={onPhoto} accessibilityLabel="Import text from a photo"><Text style={styles.otherImportIcon}>▧</Text><Text style={styles.otherImportText}>Choose photo</Text></Pressable></View></View>
    {continueItem ? <><Text style={styles.sectionTitle}>Continue listening</Text><Pressable style={styles.continueCard} onPress={onContinue} accessibilityRole="button" accessibilityLabel={`Continue ${continueItem.title}`}><View style={styles.continueTop}><SourceMark item={continueItem} /><View style={styles.grow}><Text style={styles.cardTitle} numberOfLines={1}>{continueItem.title}</Text><Text style={styles.meta}>{continueItem.source || typeLabel(continueItem.type)}</Text></View><Text style={styles.playSmall}>▶</Text></View><Progress value={continueItem.progress} /><Text style={styles.remaining}>{Math.round(continueItem.progress * 100)}% complete · {formatDuration(estimateSeconds(continueItem.wordCount * (1 - continueItem.progress), continueItem.rate)).replace('About ', '')} left</Text></Pressable></> : <EmptyState onPress={() => onImport('text')} />}
    {queue.length > 0 && <Pressable style={styles.queuePreview} onPress={onOpenQueue} accessibilityRole="button" accessibilityLabel={`Open listening queue, ${queue.length} items`}><View style={styles.queuePreviewIcon}><Text style={styles.queuePreviewGlyph}>☷</Text></View><View style={styles.grow}><Text style={styles.queuePreviewTitle}>Your listening queue</Text><Text style={styles.queuePreviewMeta}>{queue.length} {queue.length === 1 ? 'item' : 'items'} · {formatDuration(queue.reduce((seconds, item) => seconds + estimateSeconds(item.wordCount * (1 - item.progress), item.rate), 0)).replace('About ', '')}</Text></View><Text style={styles.rowChevron}>›</Text></Pressable>}
    {items.length > 0 && <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recently added</Text><Text style={styles.allLabel}>{items.length} saved</Text></View>{items.slice(0, 3).map((item) => <ItemRow key={item.id} item={item} onPress={() => onOpen(item)} />)}</>}
  </ScrollView>;
}

function ImportButton({ symbol, title, description, onPress, primary = false }: { symbol: string; title: string; description: string; onPress: () => void; primary?: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.importButton, primary && styles.importPrimary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={description}>
    <View style={[styles.importIcon, primary && styles.importIconPrimary]}><Text style={[styles.importSymbol, primary && styles.importSymbolPrimary]}>{symbol}</Text></View><View style={styles.grow}><Text style={[styles.importTitle, primary && styles.importTitlePrimary]}>{title}</Text><Text style={[styles.importDescription, primary && styles.importDescriptionPrimary]}>{description}</Text></View><Text style={[styles.chevron, primary && styles.chevronPrimary]}>›</Text>
  </Pressable>;
}

function EmptyState({ onPress }: { onPress: () => void }) { return <View style={styles.empty}><View style={styles.emptyWave}><Text style={styles.emptyPage}>▤</Text><Text style={styles.wave}>⌁⌁</Text></View><Text style={styles.emptyTitle}>Make time to listen.</Text><Text style={styles.emptyText}>Turn any article, document, or pasted text into something you can listen to.</Text><Pressable style={styles.textAction} onPress={onPress}><Text style={styles.textActionLabel}>Paste your first text</Text></Pressable></View>; }

function LibraryScreen({ items, onOpen, onDelete }: { items: LibraryItem[]; onOpen: (item: LibraryItem, autoplay?: boolean) => void; onDelete: (item: LibraryItem) => void }) {
  const [query, setQuery] = useState('');
  const filtered = items.filter((item) => `${item.title} ${item.source ?? ''} ${item.text}`.toLowerCase().includes(query.toLowerCase()));
  return <View style={styles.fullScreen}><View style={styles.libraryHeader}><Text style={styles.screenTitle}>Library</Text><Text style={styles.screenSubtitle}>Everything stays on this device.</Text><View style={styles.search}><Text style={styles.searchIcon}>⌕</Text><TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search your listening" placeholderTextColor={colors.textTertiary} accessibilityLabel="Search your library" /></View></View>
    <FlatList data={filtered} keyExtractor={(item) => item.id} contentContainerStyle={styles.libraryList} ListEmptyComponent={<View style={styles.libraryEmpty}><Text style={styles.emptyTitle}>Your library is quiet.</Text><Text style={styles.emptyText}>Items you save will appear here.</Text></View>} renderItem={({ item }) => <ItemRow item={item} onPress={() => onOpen(item, true)} onLongPress={() => onDelete(item)} />} />
  </View>;
}

function PlayerScreen({ player, onClose, showControls, setShowControls, showVoicePicker, setShowVoicePicker }: { player: ReturnType<typeof useSpeechPlayer>; onClose: () => void; showControls: boolean; setShowControls: (value: boolean) => void; showVoicePicker: boolean; setShowVoicePicker: (value: boolean) => void }) {
  const item = player.item;
  if (!item) return <View style={styles.playerScreen}><Pressable onPress={onClose}><Text style={styles.back}>‹ Home</Text></Pressable><Text style={styles.emptyTitle}>Nothing loaded yet.</Text></View>;
  const index = item.sentenceIndex;
  const currentSentences = player.sentences.slice(Math.max(0, index - 2), index + 4);
  const voice = player.voices.find((candidate) => candidate.identifier === item.selectedVoice);
  return <View style={styles.playerScreen}><View style={styles.playerHeader}><Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close player"><Text style={styles.back}>⌄</Text></Pressable><View style={styles.playerHeadText}><Text style={styles.playerTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.playerSource} numberOfLines={1}>{item.source || typeLabel(item.type)}</Text></View><Pressable onPress={() => setShowControls(!showControls)} hitSlop={12} accessibilityLabel="Player options"><Text style={styles.more}>•••</Text></Pressable></View>
    <View style={styles.nowPlaying}><Text style={styles.nowPlayingLabel}>NOW LISTENING</Text><Text style={styles.chapterTitle}>From the beginning</Text></View>
    <ScrollView style={styles.passageScroll} contentContainerStyle={styles.passageContent} showsVerticalScrollIndicator={false}>{currentSentences.map((sentence, offset) => { const sentenceIndex = Math.max(0, index - 2) + offset; const current = sentenceIndex === index; return <Pressable key={`${sentenceIndex}-${sentence.slice(0, 8)}`} onPress={() => player.jump(sentenceIndex - index)} style={[styles.sentence, current && styles.currentSentence]} accessibilityRole="button" accessibilityLabel={current ? `Current sentence: ${sentence}` : `Play from: ${sentence}`}><Text style={[styles.sentenceText, current && styles.currentSentenceText]}>{sentence}</Text></Pressable>; })}</ScrollView>
    <View style={styles.progressArea}><View style={styles.progressLabels}><Text style={styles.progressMeta}>{Math.round(item.progress * 100)}% complete</Text><Text style={styles.progressMeta}>{formatDuration(estimateSeconds(item.wordCount * (1 - item.progress), item.rate)).replace('About ', '')} left</Text></View><Progress value={item.progress} /></View>
    <View style={styles.mainControls}><Pressable style={styles.skipButton} onPress={() => player.jump(-1)} accessibilityLabel="Previous sentence"><Text style={styles.skipIcon}>‹‹</Text></Pressable><Pressable style={styles.playButton} onPress={() => player.state === 'playing' ? player.pause() : player.play()} accessibilityRole="button" accessibilityLabel={player.state === 'playing' ? 'Pause' : 'Play'}><Text style={styles.playIcon}>{player.state === 'playing' ? 'Ⅱ' : '▶'}</Text></Pressable><Pressable style={styles.skipButton} onPress={() => player.jump(1)} accessibilityLabel="Next sentence"><Text style={styles.skipIcon}>››</Text></Pressable></View>
    <View style={styles.quickControls}><Pressable style={styles.quickControl} onPress={() => setShowVoicePicker(true)} accessibilityLabel="Change voice"><Text style={styles.quickCaption}>VOICE</Text><Text style={styles.quickValue} numberOfLines={1}>{voice?.name || 'Automatic'}</Text></Pressable><Pressable style={styles.quickControl} onPress={() => player.updateSettings({ rate: speedOptions[(speedOptions.indexOf(item.rate) + 1) % speedOptions.length] })} accessibilityLabel={`Speed ${item.rate} times. Change speed`}><Text style={styles.quickCaption}>SPEED</Text><Text style={styles.quickValue}>{item.rate}×</Text></Pressable><Pressable style={styles.quickControl} onPress={() => setShowControls(!showControls)} accessibilityLabel="Advanced controls"><Text style={styles.quickCaption}>MORE</Text><Text style={styles.quickValue}>⌁</Text></Pressable></View>
    {showControls && <View style={styles.advanced}><View style={styles.advancedTop}><Text style={styles.advancedTitle}>Advanced controls</Text><Pressable onPress={() => setShowControls(false)}><Text style={styles.closeText}>Done</Text></Pressable></View><Text style={styles.controlLabel}>Pitch</Text><View style={styles.optionRow}>{([{ label: 'Low', value: 0.8 }, { label: 'Natural', value: 1 }, { label: 'High', value: 1.2 }] as const).map(({ label, value }) => <Pressable key={label} onPress={() => player.updateSettings({ pitch: value })} style={[styles.option, item.pitch === value && styles.optionSelected]}><Text style={[styles.optionText, item.pitch === value && styles.optionTextSelected]}>{label}</Text></Pressable>)}</View><Text style={styles.controlLabel}>Speed</Text><View style={styles.optionRow}>{speedOptions.map((value) => <Pressable key={value} onPress={() => player.updateSettings({ rate: value })} style={[styles.speedOption, item.rate === value && styles.optionSelected]}><Text style={[styles.optionText, item.rate === value && styles.optionTextSelected]}>{value}×</Text></Pressable>)}</View></View>}
    <Modal visible={showVoicePicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowVoicePicker(false)}><SafeAreaView style={styles.voiceModal}><View style={styles.voiceHeader}><Text style={styles.screenTitle}>Choose a voice</Text><Pressable onPress={() => setShowVoicePicker(false)}><Text style={styles.closeText}>Done</Text></Pressable></View><Text style={styles.voiceIntro}>Soundoc uses the voices already available on your iPhone.</Text><ScrollView>{player.voices.length ? player.voices.map((candidate) => <Pressable key={candidate.identifier} style={styles.voiceRow} onPress={() => { player.updateSettings({ selectedVoice: candidate.identifier }); setShowVoicePicker(false); }}><View style={styles.grow}><Text style={styles.voiceName}>{candidate.name}</Text><Text style={styles.voiceLanguage}>{candidate.language}</Text></View><Text style={styles.voiceCheck}>{candidate.identifier === item.selectedVoice ? '✓' : ''}</Text></Pressable>) : <Text style={styles.voiceIntro}>No individual voices were reported by this device. Automatic voice selection is still available.</Text>}</ScrollView></SafeAreaView></Modal>
  </View>;
}

function MiniPlayer({ item, state, onPress, onToggle }: { item: LibraryItem; state: string; onPress: () => void; onToggle: () => void }) { return <View style={styles.miniPlayer}><Pressable onPress={onPress} style={styles.miniOpen} accessibilityLabel={`Open player for ${item.title}`}><SourceMark item={item} /><View style={styles.grow}><Text style={styles.miniTitle} numberOfLines={1}>{item.title}</Text><Progress value={item.progress} compact /></View></Pressable><Pressable onPress={onToggle} style={styles.miniToggle} accessibilityLabel={state === 'playing' ? 'Pause' : 'Play'}><Text style={styles.miniToggleIcon}>{state === 'playing' ? 'Ⅱ' : '▶'}</Text></Pressable></View>; }
function TabBar({ screen, onChange, miniPlayer }: { screen: Screen; onChange: (screen: Screen) => void; miniPlayer: boolean }) { return <View style={[styles.tabBar, miniPlayer && styles.tabBarWithPlayer]}>{([{ id: 'home', icon: '⌂', label: 'Home' }, { id: 'library', icon: '▤', label: 'Library' }, { id: 'settings', icon: '⚙', label: 'Settings' }] as const).map((tab) => <Pressable key={tab.id} style={styles.tab} onPress={() => onChange(tab.id)} accessibilityRole="tab" accessibilityState={{ selected: screen === tab.id }}><Text style={[styles.tabIcon, screen === tab.id && styles.tabSelected]}>{tab.icon}</Text><Text style={[styles.tabLabel, screen === tab.id && styles.tabSelected]}>{tab.label}</Text></Pressable>)}</View>; }

function ImportModal({ mode, text, link, title, busy, onText, onLink, onTitle, onClose, onPaste, onSubmit }: { mode: ImportMode; text: string; link: string; title: string; busy: boolean; onText: (text: string) => void; onLink: (value: string) => void; onTitle: (value: string) => void; onClose: () => void; onPaste: () => void; onSubmit: () => void }) { const preview = mode === 'text' ? cleanText(text) : ''; const words = countWords(preview); return <Modal visible={mode !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.importModal}><View style={styles.modalHeader}><View><Text style={styles.screenTitle}>{mode === 'text' ? 'Paste text' : 'Paste a link'}</Text><Text style={styles.screenSubtitle}>{mode === 'text' ? 'Soundoc will clean it up automatically.' : 'We’ll find the readable article for you.'}</Text></View><Pressable onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable></View>{mode === 'text' ? <><View style={styles.titleInputWrap}><Text style={styles.inputLabel}>TITLE (OPTIONAL)</Text><TextInput value={title} onChangeText={onTitle} placeholder="Add a title" placeholderTextColor={colors.textTertiary} style={styles.titleInput} /></View><TextInput value={text} onChangeText={(value) => { onText(value); if (!title) onTitle(suggestedTitle(value)); }} multiline autoFocus placeholder="Paste or write something here…" placeholderTextColor={colors.textTertiary} style={styles.textEditor} textAlignVertical="top" accessibilityLabel="Text to listen to" /><View style={styles.editorFooter}><Pressable onPress={onPaste} style={styles.clipboard}><Text style={styles.clipboardText}>Paste from clipboard</Text></Pressable><Text style={styles.wordMeta}>{words ? `${words.toLocaleString()} words · ${formatDuration(estimateSeconds(words)).replace('About ', '')}` : 'Ready when you are'}</Text></View></> : <><TextInput value={link} onChangeText={onLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" autoFocus placeholder="https://example.com/article" placeholderTextColor={colors.textTertiary} style={styles.linkInput} accessibilityLabel="Article link" /><View style={styles.linkHelp}><Text style={styles.linkHelpTitle}>A quick privacy note</Text><Text style={styles.linkHelpText}>Soundoc only requests this public webpage directly from its original site. It never sends your library to a separate server.</Text></View></>}<Pressable onPress={onSubmit} disabled={busy} style={[styles.modalPrimary, busy && styles.disabled]}><Text style={styles.modalPrimaryText}>{busy ? 'Preparing…' : 'Prepare to listen'}</Text><Text style={styles.modalPrimaryArrow}>›</Text></Pressable></SafeAreaView></Modal>; }

function PreparedModal({ prepared, onClose, onPlay, onPlayNext, onAddToQueue }: { prepared: Prepared; onClose: () => void; onPlay: () => void; onPlayNext: () => void; onAddToQueue: () => void }) { if (!prepared) return null; const { item } = prepared; return <Modal visible animationType="fade" transparent onRequestClose={onClose}><View style={styles.preparedBackdrop}><View style={styles.preparedCard}><View style={styles.successMark}><Text style={styles.successIcon}>✓</Text></View><Text style={styles.preparedKicker}>READY TO LISTEN</Text><Text style={styles.preparedTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.preparedMessage}>{prepared.message}</Text><View style={styles.preparedMeta}><Text>{item.wordCount.toLocaleString()} words</Text><Text>·</Text><Text>{formatDuration(estimateSeconds(item.wordCount))}</Text></View><Pressable style={styles.playNow} onPress={onPlay}><Text style={styles.playNowIcon}>▶</Text><Text style={styles.playNowText}>Play</Text></Pressable><View style={styles.preparedActions}><Pressable style={styles.secondaryModalAction} onPress={onPlayNext}><Text style={styles.secondaryModalLabel}>Play next</Text></Pressable><Pressable style={styles.secondaryModalAction} onPress={onAddToQueue}><Text style={styles.secondaryModalLabel}>Add to queue</Text></Pressable></View></View></View></Modal>; }


function QueueModal({ visible, items, onClose, onOpen, onRemove, onClear }: { visible: boolean; items: LibraryItem[]; onClose: () => void; onOpen: (item: LibraryItem) => void; onRemove: (item: LibraryItem) => void; onClear: () => void }) { const remaining = items.reduce((seconds, item) => seconds + estimateSeconds(item.wordCount * (1 - item.progress), item.rate), 0); return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.queueModal}><View style={styles.queueHeader}><View><Text style={styles.screenTitle}>Your queue</Text><Text style={styles.screenSubtitle}>{items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${formatDuration(remaining).replace('About ', '')}` : 'Save something for later when it suits you.'}</Text></View><Pressable onPress={onClose}><Text style={styles.closeText}>Done</Text></Pressable></View>{items.length ? <><Pressable onPress={() => onOpen(items[0])} style={styles.queueStart}><View style={styles.queueStartPlay}><Text style={styles.queueStartPlayIcon}>▶</Text></View><View style={styles.grow}><Text style={styles.queueStartLabel}>UP NEXT</Text><Text style={styles.queueStartTitle} numberOfLines={1}>{items[0].title}</Text></View></Pressable><View style={styles.queueList}>{items.map((item, index) => <Pressable key={item.id} style={styles.queueItem} onPress={() => onOpen(item)} onLongPress={() => onRemove(item)} accessibilityLabel={`${index + 1}. ${item.title}. Hold to remove from queue.`}><Text style={styles.queueIndex}>{index + 1}</Text><SourceMark item={item} /><View style={styles.grow}><Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.itemMeta}>{formatDuration(estimateSeconds(item.wordCount * (1 - item.progress), item.rate)).replace('About ', '')}</Text></View><Text style={styles.rowChevron}>›</Text></Pressable>)}</View><Pressable onPress={onClear} style={styles.clearQueue}><Text style={styles.clearQueueText}>Clear queue</Text></Pressable></> : <View style={styles.queueEmpty}><Text style={styles.emptyTitle}>Nothing queued yet.</Text><Text style={styles.emptyText}>After importing something, choose Play next or Add to queue.</Text></View>}</SafeAreaView></Modal>; }


function ItemRow({ item, onPress, onLongPress }: { item: LibraryItem; onPress: () => void; onLongPress?: () => void }) { return <Pressable style={styles.itemRow} onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${typeLabel(item.type)}`}><SourceMark item={item} /><View style={styles.grow}><Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.itemMeta}>{item.source || typeLabel(item.type)} · {item.progress > 0 ? `${Math.round(item.progress * 100)}% complete` : formatDuration(estimateSeconds(item.wordCount)).replace('About ', '')}</Text>{item.progress > 0 && <Progress value={item.progress} compact />}</View><Text style={styles.rowChevron}>›</Text></Pressable>; }
function SourceMark({ item }: { item: LibraryItem }) { return <View style={[styles.sourceMark, item.type === 'article' && styles.articleMark]}><Text style={styles.sourceSymbol}>{item.type === 'text' ? 'T' : item.type === 'article' ? '↗' : '▤'}</Text></View>; }
function Progress({ value, compact = false }: { value: number; compact?: boolean }) { return <View style={[styles.progressTrack, compact && styles.compactProgress]}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, value * 100))}%` }]} /></View>; }
function typeLabel(type: ItemType) { return type === 'text' ? 'Pasted text' : type === 'article' ? 'Article' : 'Document'; }

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.backgroundPrimary }, scroll: { padding: space.xl, paddingBottom: 120 }, fullScreen: { flex: 1, backgroundColor: colors.backgroundPrimary }, grow: { flex: 1 }, pressed: { opacity: 0.84 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xs, marginBottom: space.xxxl }, brandMark: { ...type.title, color: colors.textPrimary, letterSpacing: -0.8 }, eyebrow: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1.25, marginTop: 2 }, privacy: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.accentSoft, borderRadius: radius.pill }, privacyIcon: { color: colors.accentPrimary, fontWeight: '700' }, privacyText: { ...type.caption, color: colors.accentPrimary },
  display: { ...type.display, fontSize: 36, lineHeight: 42, color: colors.textPrimary }, intro: { ...type.body, color: colors.textSecondary, marginTop: space.xs, maxWidth: 310 }, importGroup: { marginTop: space.xxl, gap: space.sm }, importButton: { minHeight: 86, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.borderSubtle }, importPrimary: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.22, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14, elevation: 4 }, importIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, backgroundColor: colors.accentSoft }, importIconPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' }, importSymbol: { ...type.title, color: colors.accentPrimary }, importSymbolPrimary: { color: '#FFFFFF' }, importTitle: { ...type.heading, color: colors.textPrimary }, importTitlePrimary: { color: '#FFFFFF' }, importDescription: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, importDescriptionPrimary: { color: 'rgba(255,255,255,0.76)' }, chevron: { fontSize: 28, color: colors.textTertiary }, chevronPrimary: { color: '#FFFFFF' }, otherImports: { marginTop: space.md, alignItems: 'center' }, otherImportsLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.8, marginBottom: space.xs }, otherImportActions: { flexDirection: 'row', gap: space.sm }, otherImportButton: { minHeight: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 }, otherImportIcon: { fontSize: 16, color: colors.accentPrimary }, otherImportText: { ...type.caption, color: colors.accentPrimary },
  sectionTitle: { ...type.title, color: colors.textPrimary, marginTop: space.xxxl, marginBottom: space.sm }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, allLabel: { ...type.label, color: colors.textTertiary, marginTop: space.xxxl }, continueCard: { padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle }, continueTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }, sourceMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, articleMark: { backgroundColor: '#E4F3F0' }, sourceSymbol: { ...type.heading, color: colors.accentPrimary }, cardTitle: { ...type.heading, color: colors.textPrimary }, meta: { ...type.caption, color: colors.textSecondary, marginTop: 3 }, playSmall: { width: 32, height: 32, textAlign: 'center', textAlignVertical: 'center', color: '#FFFFFF', backgroundColor: colors.accentPrimary, borderRadius: radius.pill, overflow: 'hidden', fontSize: 13, paddingLeft: 2 }, progressTrack: { height: 6, backgroundColor: colors.remainingProgress, borderRadius: radius.pill, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: colors.completedProgress, borderRadius: radius.pill }, compactProgress: { height: 3, marginTop: 8 }, remaining: { ...type.caption, color: colors.textSecondary, marginTop: space.sm },
  empty: { paddingVertical: space.xxl, alignItems: 'center', textAlign: 'center' }, emptyWave: { height: 66, width: 88, marginBottom: space.sm, alignItems: 'center', justifyContent: 'center' }, emptyPage: { fontSize: 48, color: colors.accentPrimary }, wave: { position: 'absolute', fontSize: 24, color: colors.accentSecondary, right: -2, bottom: 2 }, emptyTitle: { ...type.title, color: colors.textPrimary, textAlign: 'center' }, emptyText: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.xs, maxWidth: 290 }, textAction: { marginTop: space.md, padding: space.xs }, textActionLabel: { ...type.label, color: colors.accentPrimary },
  itemRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.divider }, itemTitle: { ...type.label, color: colors.textPrimary }, itemMeta: { ...type.caption, color: colors.textSecondary, marginTop: 3 }, rowChevron: { color: colors.textTertiary, fontSize: 24 }, libraryHeader: { padding: space.xl, paddingBottom: space.md }, screenTitle: { ...type.display, color: colors.textPrimary, fontSize: 30 }, screenSubtitle: { ...type.body, color: colors.textSecondary, marginTop: space.xs }, search: { marginTop: space.xl, flexDirection: 'row', alignItems: 'center', height: 45, borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, paddingHorizontal: space.sm, borderWidth: 1, borderColor: colors.borderSubtle }, searchIcon: { color: colors.textTertiary, fontSize: 22, marginRight: space.xs }, searchInput: { ...type.body, flex: 1, color: colors.textPrimary }, libraryList: { paddingHorizontal: space.xl, paddingBottom: 140 }, libraryEmpty: { paddingTop: 80, alignItems: 'center' },
  settingsScreen: { padding: space.xl, paddingBottom: 130 }, settingsSection: { marginTop: space.xxl }, settingsHeading: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: space.xs }, settingsCard: { backgroundColor: colors.surfacePrimary, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderSubtle, overflow: 'hidden' }, settingRow: { minHeight: 56, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, settingLabel: { ...type.label, color: colors.textPrimary }, settingValue: { ...type.label, color: colors.textSecondary }, settingHelp: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, privacyCopy: { ...type.label, color: colors.textSecondary, lineHeight: 21, padding: space.md },
  miniPlayer: { position: 'absolute', bottom: 69, left: space.md, right: space.md, height: 58, borderRadius: radius.medium, paddingLeft: 9, paddingRight: 7, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.glassTint, borderWidth: 1, borderColor: colors.borderSubtle, shadowColor: '#121218', shadowOpacity: 0.13, shadowOffset: { width: 0, height: 7 }, shadowRadius: 18, elevation: 6 }, miniOpen: { flex: 1, flexDirection: 'row', gap: 9, alignItems: 'center' }, miniTitle: { ...type.label, color: colors.textPrimary }, miniToggle: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center', marginLeft: space.sm }, miniToggleIcon: { color: '#FFFFFF', fontSize: 15, paddingLeft: 1 }, tabBar: { height: 72, backgroundColor: 'rgba(255,255,255,0.96)', borderTopWidth: 1, borderColor: colors.borderSubtle, flexDirection: 'row', paddingBottom: Platform.OS === 'ios' ? 6 : 0 }, tabBarWithPlayer: { paddingTop: 0 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 }, tabIcon: { color: colors.textTertiary, fontSize: 19 }, tabLabel: { ...type.caption, color: colors.textTertiary }, tabSelected: { color: colors.accentPrimary },
  playerScreen: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.md, backgroundColor: colors.backgroundPrimary }, playerHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 45 }, back: { color: colors.textPrimary, fontSize: 31, minWidth: 44 }, playerHeadText: { flex: 1, alignItems: 'center', paddingHorizontal: space.xs }, playerTitle: { ...type.label, color: colors.textPrimary }, playerSource: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, more: { color: colors.textPrimary, fontSize: 17, minWidth: 44, textAlign: 'right', letterSpacing: 2 }, nowPlaying: { marginTop: space.xxl }, nowPlayingLabel: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1.1 }, chapterTitle: { ...type.title, color: colors.textPrimary, marginTop: 4 }, passageScroll: { flex: 1, marginTop: space.lg }, passageContent: { paddingVertical: space.md, gap: space.xs }, sentence: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.medium }, currentSentence: { backgroundColor: colors.currentSentence }, sentenceText: { fontSize: 20, lineHeight: 31, color: colors.textTertiary }, currentSentenceText: { color: colors.textPrimary, fontWeight: '600' }, progressArea: { marginBottom: space.md }, progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs }, progressMeta: { ...type.caption, color: colors.textSecondary }, mainControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxl, marginBottom: space.lg }, skipButton: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' }, skipIcon: { color: colors.textPrimary, fontSize: 23, letterSpacing: -4 }, playButton: { height: 70, width: 70, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.accentPrimary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14 }, playIcon: { color: '#FFFFFF', fontSize: 27, paddingLeft: 2 }, quickControls: { flexDirection: 'row', gap: space.xs, marginBottom: space.md }, quickControl: { flex: 1, minHeight: 56, backgroundColor: colors.surfacePrimary, borderRadius: radius.medium, padding: space.sm, borderWidth: 1, borderColor: colors.borderSubtle, justifyContent: 'center' }, quickCaption: { ...type.caption, color: colors.textTertiary, fontSize: 10, letterSpacing: 0.6 }, quickValue: { ...type.label, color: colors.textPrimary, marginTop: 2 }, advanced: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surfacePrimary, borderTopLeftRadius: radius.xlarge, borderTopRightRadius: radius.xlarge, padding: space.xl, shadowColor: '#000', shadowOpacity: 0.16, shadowOffset: { width: 0, height: -5 }, shadowRadius: 16, elevation: 12 }, advancedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg }, advancedTitle: { ...type.title, color: colors.textPrimary }, closeText: { ...type.label, color: colors.accentPrimary }, controlLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.7, marginBottom: space.xs, marginTop: space.sm }, optionRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }, option: { flex: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 8, backgroundColor: colors.backgroundSecondary, borderRadius: radius.small }, speedOption: { minWidth: 51, flexGrow: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: colors.backgroundSecondary, borderRadius: radius.small }, optionSelected: { backgroundColor: colors.accentPrimary }, optionText: { ...type.label, color: colors.textSecondary }, optionTextSelected: { color: '#FFFFFF' },
  voiceModal: { flex: 1, padding: space.xl, backgroundColor: colors.backgroundPrimary }, voiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, voiceIntro: { ...type.body, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.lg }, voiceRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider }, voiceName: { ...type.label, color: colors.textPrimary }, voiceLanguage: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, voiceCheck: { color: colors.accentPrimary, fontSize: 21 },
  importModal: { flex: 1, padding: space.xl, backgroundColor: colors.backgroundPrimary }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.xl }, titleInputWrap: { marginBottom: space.sm }, inputLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.7, marginBottom: 5 }, titleInput: { ...type.body, height: 48, paddingHorizontal: space.sm, backgroundColor: colors.surfacePrimary, borderRadius: radius.small, borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary }, textEditor: { ...type.body, color: colors.textPrimary, flex: 1, minHeight: 210, padding: space.md, backgroundColor: colors.surfacePrimary, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderSubtle }, editorFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.sm }, clipboard: { paddingVertical: space.xs }, clipboardText: { ...type.label, color: colors.accentPrimary }, wordMeta: { ...type.caption, color: colors.textSecondary }, linkInput: { ...type.body, height: 54, paddingHorizontal: space.md, color: colors.textPrimary, backgroundColor: colors.surfacePrimary, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderSubtle }, linkHelp: { marginTop: space.lg, padding: space.md, backgroundColor: colors.accentSoft, borderRadius: radius.medium }, linkHelpTitle: { ...type.label, color: colors.accentPrimary }, linkHelpText: { ...type.caption, lineHeight: 18, color: colors.textSecondary, marginTop: 4 }, modalPrimary: { height: 56, marginTop: space.xl, backgroundColor: colors.accentPrimary, borderRadius: radius.medium, flexDirection: 'row', paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'space-between' }, disabled: { opacity: 0.5 }, modalPrimaryText: { ...type.heading, color: '#FFFFFF' }, modalPrimaryArrow: { color: '#FFFFFF', fontSize: 28 }, loadingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(23,23,33,0.72)', alignItems: 'center', justifyContent: 'center', gap: space.md }, loadingText: { ...type.label, color: '#FFFFFF' },
  preparedBackdrop: { flex: 1, backgroundColor: 'rgba(20,20,31,0.42)', justifyContent: 'flex-end', padding: space.md }, preparedCard: { backgroundColor: colors.surfacePrimary, borderRadius: radius.xlarge, padding: space.xxl, alignItems: 'center' }, successMark: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: '#E1F5ED', alignItems: 'center', justifyContent: 'center' }, successIcon: { color: colors.success, fontSize: 28, fontWeight: '700' }, preparedKicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1.2, marginTop: space.lg }, preparedTitle: { ...type.title, color: colors.textPrimary, textAlign: 'center', marginTop: space.xs }, preparedMessage: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.xs }, preparedMeta: { flexDirection: 'row', gap: space.xs, marginTop: space.sm, ...type.caption, color: colors.textSecondary }, playNow: { height: 58, backgroundColor: colors.accentPrimary, borderRadius: radius.medium, alignSelf: 'stretch', marginTop: space.xl, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, playNowIcon: { color: '#FFFFFF', fontSize: 15 }, playNowText: { ...type.heading, color: '#FFFFFF' }, preparedActions: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'center', gap: space.xs }, secondaryModalAction: { padding: space.md, marginTop: space.xs }, secondaryModalLabel: { ...type.label, color: colors.textSecondary },
  queuePreview: { marginTop: space.xxl, minHeight: 76, padding: space.md, borderRadius: radius.large, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', gap: space.sm }, queuePreviewIcon: { height: 42, width: 42, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' }, queuePreviewGlyph: { color: '#FFFFFF', fontSize: 22 }, queuePreviewTitle: { ...type.heading, color: colors.textPrimary }, queuePreviewMeta: { ...type.caption, color: colors.textSecondary, marginTop: 3 },
  legalModal: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.xl }, legalHeader: { paddingTop: space.md, paddingBottom: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, legalEffective: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.75, marginTop: 5 }, legalScroll: { paddingBottom: space.xxxl }, legalIntro: { padding: space.lg, backgroundColor: colors.accentSoft, borderRadius: radius.large, flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xxl }, legalIntroMark: { fontSize: 28, color: colors.accentPrimary }, legalIntroText: { ...type.heading, color: colors.accentPrimary, flex: 1 }, legalSection: { marginBottom: space.xl }, legalHeading: { ...type.heading, color: colors.textPrimary, marginBottom: space.xs }, legalBody: { ...type.body, color: colors.textSecondary },
  queueModal: { flex: 1, backgroundColor: colors.backgroundPrimary, padding: space.xl }, queueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, queueStart: { marginTop: space.xxl, padding: space.md, borderRadius: radius.large, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.accentPrimary }, queueStartPlay: { height: 42, width: 42, borderRadius: radius.pill, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, queueStartPlayIcon: { color: colors.accentPrimary, fontSize: 15, paddingLeft: 2 }, queueStartLabel: { ...type.caption, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8 }, queueStartTitle: { ...type.heading, color: '#FFFFFF', marginTop: 2 }, queueList: { marginTop: space.lg }, queueItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 64, borderBottomWidth: 1, borderBottomColor: colors.divider }, queueIndex: { ...type.caption, color: colors.textTertiary, width: 15, textAlign: 'center' }, clearQueue: { alignSelf: 'center', padding: space.md, marginTop: space.md }, clearQueueText: { ...type.label, color: colors.error }, queueEmpty: { paddingTop: 110, alignItems: 'center' },
  onboarding: { flex: 1, backgroundColor: colors.backgroundPrimary, padding: space.xl, justifyContent: 'space-between' }, onboardingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, skipOnboarding: { ...type.label, color: colors.textSecondary, padding: space.xs }, onboardingCenter: { alignItems: 'center', paddingHorizontal: space.md, marginTop: -30 }, onboardingMark: { width: 112, height: 112, borderRadius: 36, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xxl }, onboardingGlyph: { color: colors.accentPrimary, fontSize: 52 }, onboardingWave: { position: 'absolute', color: colors.accentSecondary, fontSize: 24, right: 14, bottom: 17 }, onboardingTitle: { ...type.display, color: colors.textPrimary, textAlign: 'center', fontSize: 34, lineHeight: 40 }, onboardingBody: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.md, maxWidth: 310 }, onboardingDots: { alignSelf: 'center', flexDirection: 'row', gap: 7, marginBottom: space.lg }, onboardingDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.borderSubtle }, onboardingDotActive: { width: 22, backgroundColor: colors.accentPrimary }, onboardingButton: { height: 57, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, flexDirection: 'row' }, onboardingButtonText: { ...type.heading, color: '#FFFFFF' }, onboardingButtonArrow: { color: '#FFFFFF', fontSize: 28 },
});
