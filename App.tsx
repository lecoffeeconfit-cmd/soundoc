import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Modal, PanResponder, Platform, Pressable, Share,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { createPlaylist, deleteBookmark, deletePlaylist, findLikelyLargeDocumentDuplicate, getDocumentChunkCount, initializeDatabase, listBookmarks, listDocumentChapters, listItems, listPlaylists, listQueueIds, removeItem, renamePlaylist, saveBookmark, saveHighlight, saveItem, saveLargeDocumentInfo, saveQueueIds, setPlaylistItemIds } from './src/lib/database';
import { extractArticleFromHtml } from './src/lib/importers';
import { cancelSummary, getPrivacyDescription, getProviderName, summarizeWithBestProvider } from './src/lib/summaryProvider';
import { askDocumentWithBestProvider, explainPassageWithBestProvider } from './src/lib/summaryProvider';
import { contentHash } from './src/lib/summarization';
import { academicText, adaptiveChange, answerFromPassages, compareOriginalAndSpoken, explainPassage, generateFlashcards, generateReviewQuestions, podcastScript, retrievePassages } from './src/lib/documentIntelligence';
import { readAnalytics } from './src/lib/analytics';
import type { ArticleExtraction } from './src/lib/importers';
import { recognizeImageText } from './src/lib/ocr';
import { cleanText, countWords, detectLanguage, estimateSeconds, formatDuration, safePublicRedirectUrl, safePublicUrl, segmentSentences, suggestedTitle } from './src/lib/text';
import { getLegalUrl } from './src/lib/legal';
import { colors, radius, shadows, space, type } from './src/lib/theme';
import { copy } from './src/lib/strings';
import { IMPORT_CAPABILITIES, IMPORT_PICKER_TYPES, LARGE_DOCUMENT_COPY, SCANNED_PDF_COPY } from './src/lib/importCapabilities';
import { useSpeechPlayer } from './src/hooks/useSpeechPlayer';
import { processSpeechText } from './src/lib/speechText';
import { copyLargeDocumentToManagedStorage, createLargeDocumentInfo, deleteManagedDocumentFile, downloadRemoteDocumentToManagedStorage, largeDocumentFormatFor, pauseLargeDocumentProcessing, processLargeDocument, resumePendingLargeDocuments, safeDocumentError, saveLargeTextToManagedStorage, shouldUseChunkedText } from './src/lib/largeDocuments';
import { estimateDocumentPages, formatDocumentPages, hasExactPageCount } from './src/lib/documentMetrics';
import { isHtmlResponse, routeDirectDocument, type DirectDocumentRoute } from './src/lib/importRouting';
import { navigationMarkersFromChapters, navigationMarkersFromSections, visibleNavigationMarkers } from './src/lib/documentNavigation';
import type { Bookmark, DocumentChapter, Flashcard, GroundedAnswer, ItemType, LibraryItem, ListeningAnalytics, PassageExplanation, Playlist, PodcastScript, ReviewQuestion, SoundocSection, SoundocSourceType, SpeechPreferences, SourcePassage, SummaryFormat, SummaryLength, SummaryResult, Voice } from './src/types';
import type { LegalDocument } from './src/types/legal';
import { OnboardingModal } from './src/components/OnboardingModal';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AudioWaveform } from './src/components/AudioWaveform';
import { PremiumBottomTabBar } from './src/components/PremiumBottomTabBar';
import { RaisedGraphiteCard } from './src/components/RaisedGraphiteCard';
import { SegmentedControlDial } from './src/components/SegmentedControlDial';
import { TactileIconButton } from './src/components/TactileIconButton';
import { VoicePicker } from './src/components/VoicePicker';
import { ListeningModeSheet } from './src/components/ListeningModeSheet';
import { ListeningStudioModal } from './src/components/ListeningStudioScreen';
import { LoadingScreen } from './src/components/LoadingScreen';
import { FeedbackCenter } from './src/components/FeedbackCenter';
import { SourceReaderScreen } from './src/components/SourceReaderScreen';
import { SubscriptionProvider } from './src/context/SubscriptionContext';
import { useSubscription } from './src/hooks/useSubscription';
import { SubscriptionStatusCard } from './src/components/SubscriptionStatusCard';
import { SubscriptionPaywall } from './src/components/SubscriptionPaywall';
import { FreeListeningModal, type FreeListeningModalKind } from './src/components/FreeListeningModal';
import { GoldenFeedbackCard } from './src/components/GoldenFeedbackCard';
import { modeSummary, resolveRuntimeSpeechPreferences } from './src/lib/listeningModes';
import { applyGoldenPreset, GOLDEN_PRESET, isGoldenControlledChange, isGoldenPresetActive } from './src/lib/goldenListening';
import { addGoldenListeningSeconds, createGoldenAdaptiveProfile, GOLDEN_PROFILE_STORAGE_KEY, markGoldenFeedbackPrompt, recordGoldenDisableSignal, recordGoldenFeedback, recordGoldenManualSignal, recordGoldenVoiceSignal, refineGoldenFeedback, shouldPromptGoldenFeedback, shouldPromptGoldenFeedbackOnPause, startGoldenExperiment, undoLastGoldenAdjustment, validateGoldenAdaptiveProfile, type GoldenAdaptiveProfile, type GoldenFeedbackReason } from './src/lib/goldenPersonalization';
import { FREE_CRITICAL_ALLOWANCE_SECONDS, formatFreeListeningRemaining } from './src/lib/freeListening';
import { originalSourceUrl, shouldOpenOriginalWebPage } from './src/lib/sourceViewing';

type Screen = 'home' | 'library' | 'settings' | 'player';
type ImportMode = 'text' | 'link' | null;
type Prepared = { item: LibraryItem; message: string } | null;
type ArticlePreview = ArticleExtraction | null;
type OcrDraft = { text: string; title: string; source: 'library' | 'camera'; sourceUri?: string } | null;
type LearningToolTab = 'ask' | 'explain' | 'review' | 'academic' | 'compare' | 'podcast';

const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const pitchOptions = [{ label: 'Very Low', value: 0.6 }, { label: 'Low', value: 0.8 }, { label: 'Natural', value: 1 }, { label: 'High', value: 1.25 }, { label: 'Very High', value: 1.5 }] as const;
const sampleText = 'Welcome to Soundoc. Your iPhone can read articles, notes, and documents aloud using a voice already on your device.';
const defaultSpeechPreferences: SpeechPreferences = { presetId: 'recommended', modeId: 'recommended', rate: GOLDEN_PRESET.rate, pitch: GOLDEN_PRESET.pitch, volume: GOLDEN_PRESET.volume, sentencePauseMs: GOLDEN_PRESET.sentencePauseMs, paragraphPauseMs: GOLDEN_PRESET.paragraphPauseMs, headingPauseMs: GOLDEN_PRESET.headingPauseMs, pronunciationRules: [], skipHeadings: false, skipUrls: true, skipCitations: true, skipSiteBoilerplate: true, skipNavigationAndAds: true, skipConsecutiveDuplicates: true, skipLongNumbersAndCodes: true, skipReferenceSection: true, preserveHeadings: true, favoriteVoiceIds: [], recentVoiceIds: [], adaptiveListeningEnabled: false, recommendedListening: true, podcastModeEnabled: false, smartFilteringEnabled: true, ...applyGoldenPreset() };
type ListeningSettings = SpeechPreferences;
const summaryStorageKey = (documentId: string, result: Pick<SummaryResult, 'contentHash' | 'format' | 'length' | 'provider'>) => `soundoc.summary.${documentId}.${result.contentHash}.${result.format}.${result.length}.${result.provider}`;

function SoundocApp() {
  const subscription = useSubscription();
  const [screen, setScreen] = useState<Screen>('home');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>(null);
  const [draftText, setDraftText] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepared, setPrepared] = useState<Prepared>(null);
  const [articlePreview, setArticlePreview] = useState<ArticlePreview>(null);
  const [ocrDraft, setOcrDraft] = useState<OcrDraft>(null);
  const [showControls, setShowControls] = useState(false);
  const [showListeningStudio, setShowListeningStudio] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState('');
  const summarySignal = useRef({ cancelled: false });
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showLearningTools, setShowLearningTools] = useState(false);
  const [learningStartTab, setLearningStartTab] = useState<LearningToolTab>('ask');
  const [learningQuestion, setLearningQuestion] = useState('');
  const [learningPassages, setLearningPassages] = useState<SourcePassage[]>([]);
  const [learningAnswer, setLearningAnswer] = useState<GroundedAnswer | null>(null);
  const [learningExplanation, setLearningExplanation] = useState<PassageExplanation | null>(null);
  const [learningCards, setLearningCards] = useState<Flashcard[]>([]);
  const [learningReview, setLearningReview] = useState<ReviewQuestion[]>([]);
  const [learningPodcast, setLearningPodcast] = useState<PodcastScript | null>(null);
  const [learningBusy, setLearningBusy] = useState(false);
  const [analytics, setAnalytics] = useState<ListeningAnalytics | null>(null);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [documentChapters, setDocumentChapters] = useState<DocumentChapter[]>([]);
  const [reduceEffects, setReduceEffects] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sourceReaderItemId, setSourceReaderItemId] = useState<string | null>(null);
  const [showImportCapabilities, setShowImportCapabilities] = useState(false);
  const [listeningDefaults, setListeningDefaults] = useState<ListeningSettings>(defaultSpeechPreferences);
  const [goldenProfile, setGoldenProfile] = useState<GoldenAdaptiveProfile | null>(null);
  const [showGoldenFeedback, setShowGoldenFeedback] = useState(false);
  const [freeListeningModal, setFreeListeningModal] = useState<FreeListeningModalKind>(null);
  const [dismissedMiniPlayerItemId, setDismissedMiniPlayerItemId] = useState<string | null>(null);
  const listeningPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goldenListeningSeconds = useRef<number | null>(null);
  const dismissingMiniPlayerItemId = useRef<string | null>(null);

  useEffect(() => {
    initializeDatabase();
    setItems(listItems());
    setQueueIds(listQueueIds());
    setPlaylists(listPlaylists());
    setBookmarks(listBookmarks());
    void resumePendingLargeDocuments(() => setItems(listItems())).catch(() => undefined);
    void AsyncStorage.multiGet(['soundoc.onboarding.complete', 'soundoc.listening.defaults', GOLDEN_PROFILE_STORAGE_KEY]).then(([onboarding, defaults, storedGoldenProfile]) => {
      setOnboardingComplete(onboarding[1] === 'true');
      if (storedGoldenProfile?.[1]) {
        try { setGoldenProfile(validateGoldenAdaptiveProfile(JSON.parse(storedGoldenProfile[1])) ?? createGoldenAdaptiveProfile()); } catch { setGoldenProfile(createGoldenAdaptiveProfile()); }
      } else setGoldenProfile(createGoldenAdaptiveProfile());
      if (!defaults[1]) return;
      try {
        const parsed = JSON.parse(defaults[1]) as Partial<ListeningSettings>;
        const storedMode = parsed.modeId ?? (parsed.presetId === 'custom' ? 'custom' : 'recommended');
        const legacyGolden = parsed.recommendedListening === true || (parsed.recommendedListening === undefined && (storedMode === 'recommended' || storedMode === 'smart'));
        const modeId = !legacyGolden && parsed.recommendedListening === false && (storedMode === 'recommended' || storedMode === 'smart') ? 'custom' : storedMode;
        const migrated = { ...defaultSpeechPreferences, ...parsed, modeId, rate: typeof parsed.rate === 'number' ? Math.min(2, Math.max(0.1, parsed.rate)) : defaultSpeechPreferences.rate, pitch: typeof parsed.pitch === 'number' ? Math.min(2, Math.max(0.5, parsed.pitch)) : defaultSpeechPreferences.pitch, volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : defaultSpeechPreferences.volume, pronunciationRules: Array.isArray(parsed.pronunciationRules) ? parsed.pronunciationRules : [], favoriteVoiceIds: Array.isArray(parsed.favoriteVoiceIds) ? parsed.favoriteVoiceIds : [], recentVoiceIds: Array.isArray(parsed.recentVoiceIds) ? parsed.recentVoiceIds : [], skipLongNumbersAndCodes: parsed.skipLongNumbersAndCodes !== false, recommendedListening: legacyGolden, listeningStudioEnabled: parsed.listeningStudioEnabled === true, ambienceType: parsed.ambienceType ?? 'none', ambienceVolume: typeof parsed.ambienceVolume === 'number' ? Math.min(1, Math.max(0, parsed.ambienceVolume)) : 0, podcastModeEnabled: parsed.podcastModeEnabled === true, smartFilteringEnabled: parsed.smartFilteringEnabled !== false } as ListeningSettings;
        setListeningDefaults(legacyGolden ? { ...migrated, ...applyGoldenPreset() } : migrated);
      } catch { /* Keep natural defaults when storage is malformed. */ }
    }).catch(() => { setOnboardingComplete(false); setGoldenProfile(null); });
  }, []);

  useEffect(() => () => { if (listeningPersistTimer.current) clearTimeout(listeningPersistTimer.current); }, []);
  useEffect(() => { if (goldenProfile) void AsyncStorage.setItem(GOLDEN_PROFILE_STORAGE_KEY, JSON.stringify(goldenProfile)).catch(() => undefined); }, [goldenProfile]);

  const persist = useCallback((next: LibraryItem) => {
    saveItem(next);
    setItems((current) => [next, ...current.filter((item) => item.id !== next.id)].sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);
  const refreshLargeImport = useCallback((documentId: string) => {
    const nextItems = listItems();
    setItems(nextItems);
    setPrepared((current) => {
      if (!current || current.item.id !== documentId) return current;
      const updated = nextItems.find((item) => item.id === documentId);
      return updated ? { ...current, item: updated } : current;
    });
  }, []);
  const player = useSpeechPlayer(persist, listeningDefaults, goldenProfile, {
    isReady: subscription.isPlaybackAccessReady,
    canStartPlayback: subscription.canStartPlayback,
    consumeFreeListening: subscription.consumeFreeListening,
    onLowAllowanceReached: () => setFreeListeningModal((current) => current === 'limit' ? current : 'low'),
    onLimitReached: () => setFreeListeningModal('limit'),
  });
  const dismissListeningSession = useCallback(() => {
    const active = player.item;
    if (!active || player.state !== 'paused' || dismissingMiniPlayerItemId.current === active.id) return;
    dismissingMiniPlayerItemId.current = active.id;
    player.pause();
    setDismissedMiniPlayerItemId(active.id);
  }, [player.item, player.pause, player.state]);
  useEffect(() => {
    if (player.state !== 'playing') return;
    dismissingMiniPlayerItemId.current = null;
    setDismissedMiniPlayerItemId(null);
  }, [player.state]);
  useEffect(() => {
    if (subscription.isPro || !subscription.isFree) setFreeListeningModal(null);
  }, [subscription.isFree, subscription.isPro]);
  useEffect(() => {
    if (!goldenProfile || player.state !== 'playing' || !isGoldenPresetActive(listeningDefaults)) return;
    if (goldenListeningSeconds.current === null) goldenListeningSeconds.current = goldenProfile.totalListeningSeconds;
    let lastRecordedAt = Date.now();
    const recordElapsed = () => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastRecordedAt) / 1000);
      if (elapsedSeconds <= 0) return;
      lastRecordedAt += elapsedSeconds * 1000;
      goldenListeningSeconds.current = (goldenListeningSeconds.current ?? 0) + elapsedSeconds;
      setGoldenProfile((current) => current ? addGoldenListeningSeconds(current, elapsedSeconds) : current);
    };
    const timer = setInterval(recordElapsed, 1000);
    return () => { clearInterval(timer); recordElapsed(); };
  }, [listeningDefaults.recommendedListening, listeningDefaults.modeId, player.state]);
  useEffect(() => {
    if (!goldenProfile || !player.item || player.state !== 'playing' || !isGoldenPresetActive(listeningDefaults)) return;
    const baseline = resolveRuntimeSpeechPreferences({ ...listeningDefaults, ...applyGoldenPreset() }, player.item, player.voices, null);
    setGoldenProfile((current) => {
      if (!current) return current;
      const next = startGoldenExperiment(current, baseline, player.voices, player.item?.language ?? 'en-US');
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [goldenProfile, listeningDefaults, player.item?.sentenceIndex, player.state, player.voices]);
  useEffect(() => {
    if (!goldenProfile || screen !== 'settings' || !isGoldenPresetActive(listeningDefaults) || !shouldPromptGoldenFeedback(goldenProfile)) return;
    setShowGoldenFeedback(true);
    setGoldenProfile((current) => current ? markGoldenFeedbackPrompt(current) : current);
  }, [goldenProfile, listeningDefaults.recommendedListening, listeningDefaults.modeId, screen]);
  const lastPlayerState = useRef(player.state);
  useEffect(() => {
    const wasPlaying = lastPlayerState.current === 'playing';
    lastPlayerState.current = player.state;
    if (!wasPlaying || player.state !== 'paused' || !goldenProfile || !isGoldenPresetActive(listeningDefaults)) return;
    const profileWithLatestListening = goldenListeningSeconds.current === null || goldenListeningSeconds.current <= goldenProfile.totalListeningSeconds
      ? goldenProfile
      : { ...goldenProfile, totalListeningSeconds: goldenListeningSeconds.current };
    if (!shouldPromptGoldenFeedbackOnPause(profileWithLatestListening)) return;
    setShowGoldenFeedback(true);
    setGoldenProfile((current) => current ? markGoldenFeedbackPrompt({ ...current, totalListeningSeconds: Math.max(current.totalListeningSeconds, profileWithLatestListening.totalListeningSeconds) }) : current);
  }, [goldenProfile, listeningDefaults.recommendedListening, listeningDefaults.modeId, player.state]);
  useEffect(() => { void readAnalytics().then(setAnalytics).catch(() => undefined); }, [player.item?.sentenceIndex, player.state]);
  const mutateGoldenProfile = useCallback((change: (profile: GoldenAdaptiveProfile) => GoldenAdaptiveProfile) => {
    setGoldenProfile((current) => change(current ?? createGoldenAdaptiveProfile()));
  }, []);
  const handleGoldenGood = useCallback(() => { mutateGoldenProfile((profile) => recordGoldenFeedback(profile, 'good')); setShowGoldenFeedback(false); }, [mutateGoldenProfile]);
  const handleGoldenNotQuite = useCallback(() => { mutateGoldenProfile((profile) => recordGoldenFeedback(profile, 'notQuite')); }, [mutateGoldenProfile]);
  const handleGoldenReason = useCallback((reason: GoldenFeedbackReason) => { mutateGoldenProfile((profile) => refineGoldenFeedback(profile, reason)); setShowGoldenFeedback(false); }, [mutateGoldenProfile]);
  const handleGoldenFeedbackDismiss = useCallback(() => setShowGoldenFeedback(false), []);
  const handleGoldenUndo = useCallback(() => mutateGoldenProfile((profile) => undoLastGoldenAdjustment(profile)), [mutateGoldenProfile]);
  const handleGoldenProfileReset = useCallback(() => { goldenListeningSeconds.current = 0; setGoldenProfile(createGoldenAdaptiveProfile()); setShowGoldenFeedback(false); }, []);
  const updateListeningSettings = useCallback((settings: Partial<ListeningSettings>) => {
    const activatingGolden = settings.recommendedListening === true || settings.modeId === 'recommended' || settings.modeId === 'smart';
    const requested = activatingGolden ? { ...settings, ...applyGoldenPreset() } : settings;
    const editingSpeech = isGoldenControlledChange(requested);
    const disablingGolden = isGoldenPresetActive(listeningDefaults) && (settings.recommendedListening === false || settings.modeId === 'custom');
    if (disablingGolden) mutateGoldenProfile((profile) => recordGoldenDisableSignal(profile));
    const passiveGoldenChange = isGoldenPresetActive(listeningDefaults) && !activatingGolden && settings.recommendedListening === undefined && settings.modeId === undefined;
    if (passiveGoldenChange) {
      const baseline = { rate: GOLDEN_PRESET.rate, pitch: GOLDEN_PRESET.pitch, volume: GOLDEN_PRESET.volume, sentencePauseMs: GOLDEN_PRESET.sentencePauseMs, paragraphPauseMs: GOLDEN_PRESET.paragraphPauseMs, headingPauseMs: GOLDEN_PRESET.headingPauseMs };
      if (typeof settings.rate === 'number') mutateGoldenProfile((profile) => recordGoldenManualSignal(profile, 'rate', settings.rate as number, baseline));
      if (typeof settings.pitch === 'number') mutateGoldenProfile((profile) => recordGoldenManualSignal(profile, 'pitch', settings.pitch as number, baseline));
      if (typeof settings.sentencePauseMs === 'number') mutateGoldenProfile((profile) => recordGoldenManualSignal(profile, 'sentencePause', settings.sentencePauseMs as number, baseline));
      if (typeof settings.paragraphPauseMs === 'number') mutateGoldenProfile((profile) => recordGoldenManualSignal(profile, 'paragraphPause', settings.paragraphPauseMs as number, baseline));
      if (typeof settings.voiceIdentifier === 'string') mutateGoldenProfile((profile) => recordGoldenVoiceSignal(profile, settings.voiceIdentifier));
    }
    const normalized = requested.modeId === undefined && editingSpeech ? { ...requested, modeId: 'custom' as const, presetId: 'custom', recommendedListening: false } : requested;
    setListeningDefaults((current) => {
      const captureCustom = requested.modeId === undefined && editingSpeech;
      const previousCustom = current.customProfile ?? { rate: current.rate, pitch: current.pitch, volume: current.volume, sentencePauseMs: current.sentencePauseMs, paragraphPauseMs: current.paragraphPauseMs, headingPauseMs: current.headingPauseMs, skipHeadings: current.skipHeadings, skipUrls: current.skipUrls, skipCitations: current.skipCitations, skipConsecutiveDuplicates: current.skipConsecutiveDuplicates, skipLongNumbersAndCodes: current.skipLongNumbersAndCodes, skipReferenceSection: current.skipReferenceSection, skipSiteBoilerplate: current.skipSiteBoilerplate, skipNavigationAndAds: current.skipNavigationAndAds, skipSharingControls: current.skipSharingControls, skipRelatedStories: current.skipRelatedStories, skipDatabaseIdentifiers: current.skipDatabaseIdentifiers };
      const customProfile = captureCustom ? { ...previousCustom, rate: requested.rate ?? previousCustom.rate, pitch: requested.pitch ?? previousCustom.pitch, volume: requested.volume ?? previousCustom.volume, sentencePauseMs: requested.sentencePauseMs ?? previousCustom.sentencePauseMs, paragraphPauseMs: requested.paragraphPauseMs ?? previousCustom.paragraphPauseMs, headingPauseMs: requested.headingPauseMs ?? previousCustom.headingPauseMs, skipHeadings: requested.skipHeadings ?? previousCustom.skipHeadings, skipUrls: requested.skipUrls ?? previousCustom.skipUrls, skipCitations: requested.skipCitations ?? previousCustom.skipCitations, skipConsecutiveDuplicates: requested.skipConsecutiveDuplicates ?? previousCustom.skipConsecutiveDuplicates, skipLongNumbersAndCodes: requested.skipLongNumbersAndCodes ?? previousCustom.skipLongNumbersAndCodes, skipReferenceSection: requested.skipReferenceSection ?? previousCustom.skipReferenceSection, skipSiteBoilerplate: requested.skipSiteBoilerplate ?? previousCustom.skipSiteBoilerplate, skipNavigationAndAds: requested.skipNavigationAndAds ?? previousCustom.skipNavigationAndAds, skipSharingControls: requested.skipSharingControls ?? previousCustom.skipSharingControls, skipRelatedStories: requested.skipRelatedStories ?? previousCustom.skipRelatedStories, skipDatabaseIdentifiers: requested.skipDatabaseIdentifiers ?? previousCustom.skipDatabaseIdentifiers } : current.customProfile;
      const next = { ...current, ...normalized, ...(captureCustom ? { customProfile } : {}) };
      if (listeningPersistTimer.current) clearTimeout(listeningPersistTimer.current);
      listeningPersistTimer.current = setTimeout(() => { void AsyncStorage.setItem('soundoc.listening.defaults', JSON.stringify(next)).catch(() => undefined); listeningPersistTimer.current = null; }, 180);
      return next;
    });
    const updatesPlayer = Object.keys(normalized).some((key) => !['listeningStudioEnabled', 'listeningStudioPreset', 'ambienceType', 'ambienceVolume'].includes(key));
    if (player.item && updatesPlayer) player.updateSettings(normalized);
  }, [listeningDefaults, mutateGoldenProfile, player]);

  useEffect(() => {
    const active = player.item;
    if (!active) { setSummary(null); return; }
    const hash = contentHash(active.cleanedText ?? active.text);
    void AsyncStorage.getAllKeys().then((keys) => { const prefix = `soundoc.summary.${active.id}.${hash}.`; const matching = keys.filter((key) => key.startsWith(prefix)); return matching.length ? AsyncStorage.getItem(matching[matching.length - 1]) : AsyncStorage.getItem(`soundoc.summary.${active.id}.${hash}`); }).then((stored) => { if (!stored) { setSummary(null); return; } try { const parsed = JSON.parse(stored) as SummaryResult; setSummary(parsed.contentHash === hash ? parsed : null); } catch { setSummary(null); } }).catch(() => setSummary(null));
  }, [player.item?.id]);

  const generateSummary = useCallback(async (length: SummaryLength, format: SummaryFormat) => {
    if (!subscription.requirePro()) return;
    const active = player.item; if (!active) return;
    summarySignal.current = { cancelled: false }; setSummaryBusy(true); setSummaryProgress('Preparing document');
    try {
      const result = await summarizeWithBestProvider({ documentId: active.id, title: active.title, language: active.language, text: active.cleanedText ?? active.text, sections: active.sections, length, format }, setSummaryProgress, summarySignal.current);
      if (summarySignal.current.cancelled) return;
      await AsyncStorage.setItem(summaryStorageKey(active.id, result), JSON.stringify(result)); setSummary(result);
    } catch (error) { if (!summarySignal.current.cancelled) Alert.alert('Couldn’t create summary', error instanceof Error ? error.message : 'Try again with a little more text.'); }
    finally { setSummaryBusy(false); setSummaryProgress(''); }
  }, [player.item, subscription]);
  const cancelSummaryGeneration = useCallback(() => { summarySignal.current.cancelled = true; void cancelSummary(); setSummaryBusy(false); setSummaryProgress(''); }, []);
  const deleteSummary = useCallback(() => { const active = player.item; if (!active || !summary) return; void AsyncStorage.removeItem(summaryStorageKey(active.id, summary)).catch(() => undefined); void AsyncStorage.removeItem(`soundoc.summary.${active.id}.${summary.contentHash}`).catch(() => undefined); setSummary(null); }, [player.item, summary]);

  const askActiveDocument = useCallback(async (question: string) => {
    const active = player.item; if (!active || !question.trim()) return;
    setLearningBusy(true); setLearningQuestion(question); setLearningAnswer(null);
    const passages = retrievePassages(active.cleanedText ?? active.text, active.sections, question, 4); setLearningPassages(passages);
    const answer = await askDocumentWithBestProvider({ question, passages: passages.map((passage) => `${passage.sectionTitle}: ${passage.text}`), language: active.language }, () => answerFromPassages(question, passages));
    setLearningAnswer(answer); setLearningBusy(false);
  }, [player.item]);
  const explainActivePassage = useCallback(async () => {
    const active = player.item; if (!active) return;
    const sentence = player.sentences[active.sentenceIndex] || active.text.slice(0, 600); const passage: SourcePassage = { sectionId: active.currentSectionId ?? 'document', sectionTitle: active.sections?.find((section) => section.id === active.currentSectionId)?.title || 'Current passage', text: sentence, startOffset: active.currentCharacterOffset ?? 0, endOffset: (active.currentCharacterOffset ?? 0) + sentence.length };
    setLearningBusy(true); setLearningExplanation(null); const result = await explainPassageWithBestProvider({ passage: sentence, language: active.language }, () => explainPassage(passage)); setLearningExplanation(result); setLearningBusy(false);
  }, [player.item, player.sentences]);
  const createLearningCards = useCallback(() => { const active = player.item; if (!active) return; setLearningCards(generateFlashcards(active.cleanedText ?? active.text, active.sections)); setLearningReview(generateReviewQuestions(active.cleanedText ?? active.text, active.sections)); }, [player.item]);
  const createPodcast = useCallback(() => { const active = player.item; if (!active) return; setLearningPodcast(podcastScript(active.cleanedText ?? active.text, active.sections)); }, [player.item]);
  const openLearningTools = useCallback((tab: LearningToolTab = 'ask') => {
    if (!subscription.requirePro()) return;
    setLearningStartTab(tab); if (tab === 'podcast') createPodcast(); if (tab === 'review') createLearningCards(); setShowLearningTools(true);
  }, [createLearningCards, createPodcast, subscription]);
  const spokenPreview = useMemo(() => { if (!player.item) return null; const original = player.item.originalText ?? player.item.text; const spoken = processSpeechText(original, listeningDefaults, player.item.language).map((chunk) => chunk.text).join('\n\n'); return compareOriginalAndSpoken(original, spoken); }, [listeningDefaults, player.item]);
  const academic = useMemo(() => player.item ? academicText(player.item.cleanedText ?? player.item.text, player.item.sections) : [], [player.item]);

  const resumablePlayerItem = useMemo(() => items.filter((item) => !item.completed && (item.progress > 0 || item.lastOpenedAt !== undefined)).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0] ?? null, [items]);
  const continueItem = useMemo(() => resumablePlayerItem ?? items[0], [items, resumablePlayerItem]);
  const recentItems = useMemo(() => items.slice(0, 5), [items]);
  const queue = useMemo(() => queueIds.map((id) => items.find((item) => item.id === id)).filter((item): item is LibraryItem => Boolean(item)), [items, queueIds]);
  const readyListeningSeconds = useMemo(() => items.reduce((total, item) => total + (item.completed ? 0 : remainingListeningSeconds(item)), 0), [items]);

  const openScreen = useCallback((next: Screen) => {
    if (next === 'player' && !player.item && resumablePlayerItem) player.load(resumablePlayerItem);
    setScreen(next);
  }, [player.item, player.load, resumablePlayerItem]);

  useEffect(() => {
    if (screen !== 'player' || player.item || !resumablePlayerItem) return;
    player.load(resumablePlayerItem);
  }, [player.item, player.load, resumablePlayerItem, screen]);

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
  const addPlaylist = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const playlist = createPlaylist(trimmed);
    setPlaylists((current) => [playlist, ...current]);
  }, []);
  const updatePlaylistItems = useCallback((playlistId: string, itemIds: string[]) => {
    setPlaylistItemIds(playlistId, itemIds);
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId ? { ...playlist, itemIds, updatedAt: Date.now() } : playlist));
  }, []);
  const removePlaylist = useCallback((playlistId: string) => {
    deletePlaylist(playlistId);
    setPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId));
  }, []);
  const editPlaylistName = useCallback((playlistId: string, name: string) => {
    if (!name.trim()) return;
    renamePlaylist(playlistId, name);
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId ? { ...playlist, name: name.trim(), updatedAt: Date.now() } : playlist));
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

  const openLegal = useCallback((document: LegalDocument) => {
    if (!document) return;
    void Linking.openURL(getLegalUrl(document)).catch(() => {
      Alert.alert('Unable to open legal document', 'Please check your connection and try again.');
    });
  }, []);

  const makeItem = useCallback((text: string, itemType: ItemType, title?: string, source?: string, sourceUrl?: string, metadata?: Partial<LibraryItem>): LibraryItem => {
    const cleaned = cleanText(text);
    const now = Date.now();
    return {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`, type: itemType,
      title: title?.trim() || suggestedTitle(cleaned), source, sourceUrl, text: cleaned,
      language: detectLanguage(cleaned), wordCount: countWords(cleaned), createdAt: now, updatedAt: now,
      sentenceIndex: 0, progress: 0, selectedModeId: metadata?.selectedModeId ?? listeningDefaults.modeId, selectedVoice: listeningDefaults.voiceIdentifier, rate: listeningDefaults.rate, pitch: listeningDefaults.pitch, completed: false, sourceType: metadata?.sourceType ?? (itemType === 'article' ? 'url' : 'text'), originalText: metadata?.originalText ?? text, cleanedText: cleaned, extractionMethod: metadata?.extractionMethod ?? 'manual-text', extractionConfidence: metadata?.extractionConfidence ?? 1, extractionWarnings: metadata?.extractionWarnings ?? [], sections: metadata?.sections, author: metadata?.author, sourceUri: metadata?.sourceUri, storageMode: metadata?.storageMode, processingStatus: metadata?.processingStatus, processingProgress: metadata?.processingProgress, processedUnits: metadata?.processedUnits, totalUnits: metadata?.totalUnits, fileSize: metadata?.fileSize, pageCount: metadata?.pageCount ?? estimateDocumentPages(cleaned), estimatedDurationSeconds: metadata?.estimatedDurationSeconds ?? (cleaned ? estimateSeconds(countWords(cleaned)) : undefined), currentChunkIndex: metadata?.currentChunkIndex,
    };
  }, [listeningDefaults]);

  const queueLongText = useCallback((input: { text: string; title?: string; itemType: ItemType; source?: string; sourceUrl?: string; sourceType: SoundocSourceType; extractionMethod: string; format?: string; extractionConfidence?: number; extractionWarnings?: string[] }) => {
    const text = cleanText(input.text); const wordCount = countWords(text); const pageCount = estimateDocumentPages(wordCount);
    const item = makeItem('', input.itemType, input.title?.trim() || suggestedTitle(text), input.source, input.sourceUrl, { sourceType: input.sourceType, extractionMethod: input.extractionMethod, extractionConfidence: input.extractionConfidence, extractionWarnings: input.extractionWarnings, storageMode: 'chunked', processingStatus: 'queued', fileSize: text.length, pageCount, estimatedDurationSeconds: estimateSeconds(wordCount) });
    const sourceUri = saveLargeTextToManagedStorage(item.id, text);
    const info = createLargeDocumentInfo({ documentId: item.id, originalFileName: `${item.title || 'Pasted text'}.txt`, sourceUri, format: input.format ?? 'Text file', fileSize: new File(sourceUri).size, pageCount, status: 'queued' });
    const stored: LibraryItem = { ...item, sourceUri, processingStatus: 'queued', fileSize: info.fileSize, wordCount, pageCount, estimatedDurationSeconds: estimateSeconds(wordCount) };
    saveLargeDocumentInfo(info); persist(stored); void processLargeDocument(item.id, () => refreshLargeImport(item.id));
    return stored;
  }, [makeItem, persist, refreshLargeImport]);

  const acceptShareHandoff = useCallback((incomingUrl: string | null) => {
    if (!incomingUrl) return;
    const { path, hostname, queryParams } = Linking.parse(incomingUrl);
    if (path !== 'import' && hostname !== 'import') return;
    const sharedText = typeof queryParams?.text === 'string' ? queryParams.text : undefined;
    const sharedUrl = typeof queryParams?.url === 'string' ? queryParams.url : undefined;
    if (sharedText?.trim()) {
      const longText = shouldUseChunkedText(sharedText);
      const item = longText
        ? queueLongText({ text: sharedText, itemType: 'text', sourceType: 'shared', extractionMethod: 'share-handoff' })
        : makeItem(sharedText, 'text', undefined, undefined, undefined, { sourceType: 'shared', extractionMethod: 'share-handoff' });
      if (!longText) persist(item);
      setPrepared({ item, message: longText ? 'Preparing your shared text. You can listen as soon as the first section is ready.' : 'Shared text is ready to listen.' });
    } else if (sharedUrl) {
      setDraftLink(sharedUrl); setImportMode('link');
    }
  }, [makeItem, persist, queueLongText]);

  useEffect(() => {
    void Linking.getInitialURL().then(acceptShareHandoff).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => acceptShareHandoff(url));
    return () => subscription.remove();
  }, [acceptShareHandoff]);

  const prepareText = () => {
    const text = cleanText(draftText);
    if (!text) { Alert.alert('Add some text first', 'Paste or type something you want to listen to.'); return; }
    if (shouldUseChunkedText(text)) {
      try {
        const item = queueLongText({ text, title: draftTitle, itemType: 'text', sourceType: 'text', extractionMethod: 'chunked-pasted-text' });
        setImportMode(null); setPrepared({ item, message: 'Preparing your long text. You can start listening as soon as the first section is ready.' });
      } catch (error) { Alert.alert('Couldn’t prepare this text', safeDocumentError(error, 'Your pasted text is still open. Try again after freeing some storage.')); }
      return;
    }
    const editedSourceUrl = safePublicUrl(draftLink)?.toString();
    const item = makeItem(text, editedSourceUrl ? 'article' : 'text', draftTitle, editedSourceUrl ? new URL(editedSourceUrl).hostname : undefined, editedSourceUrl);
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
      const documentFromPath = routeDirectDocument(url);
      if (documentFromPath) {
        const imported = await beginRemoteDocumentImport(url, documentFromPath);
        if (imported) setImportMode(null);
        return;
      }
      // An extensionless public download can identify itself in HEAD headers. This keeps the
      // actual file download on the streaming file-system path instead of loading it as a web page.
      try {
        let headerUrl = url;
        let headers: Response | undefined;
        for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
          headers = await fetch(headerUrl.toString(), { method: 'HEAD', redirect: 'manual' });
          if (![301, 302, 303, 307, 308].includes(headers.status)) break;
          const nextUrl = safePublicRedirectUrl(headerUrl, headers.headers.get('location'));
          if (!nextUrl) break;
          headerUrl = nextUrl;
        }
        const directDocument = headers?.ok ? routeDirectDocument(headerUrl, headers.headers.get('content-type'), headers.headers.get('content-disposition')) : undefined;
        if (directDocument) {
          const declaredLength = Number(headers?.headers.get('content-length') ?? 0);
          const imported = await beginRemoteDocumentImport(headerUrl, directDocument, Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : undefined, headers?.headers.get('content-type') ?? undefined);
          if (imported) setImportMode(null);
          return;
        }
      } catch { /* Some public hosts disallow HEAD; the normal guarded fetch below remains available. */ }
      let currentUrl = url;
      let response: Response | undefined;
      for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        response = await fetch(currentUrl.toString(), { redirect: 'manual' });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const nextUrl = safePublicRedirectUrl(currentUrl, response.headers.get('location'));
        if (!nextUrl) throw new Error('unsafe-redirect');
        currentUrl = nextUrl;
      }
      if (!response || [301, 302, 303, 307, 308].includes(response.status)) throw new Error('too-many-redirects');
      const resolvedResponseUrl = response.url ? safePublicUrl(response.url) : currentUrl;
      if (!resolvedResponseUrl) throw new Error('unsafe-redirect');
      const contentType = response.headers.get('content-type') ?? '';
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (!response.ok) throw new Error('not-readable');
      const directDocument = routeDirectDocument(resolvedResponseUrl, contentType, response.headers.get('content-disposition'));
      if (directDocument) {
        const imported = await beginRemoteDocumentImport(resolvedResponseUrl, directDocument, Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : undefined, contentType);
        if (imported) setImportMode(null);
        return;
      }
      if (!isHtmlResponse(contentType)) throw new Error('not-readable');
      const html = await response.text();
      if (html.length > 12 * 1024 * 1024) throw new Error('too-large');
      const extraction = extractArticleFromHtml(html, resolvedResponseUrl.toString());
      if (countWords(extraction.text) < 25) throw new Error('not-readable');
      setImportMode(null); setArticlePreview(extraction);
    } catch {
      Alert.alert('Couldn’t find a clean article', 'This page may require a sign-in, be paywalled, or not contain a readable article. Try pasting the article text instead.');
    } finally { setIsPreparing(false); }
  };

  const documentSourceType = (name: string): SoundocSourceType => {
    const value = name.split('.').pop()?.toLowerCase();
    if (value === 'pdf' || value === 'docx' || value === 'epub') return value;
    if (value === 'html' || value === 'htm') return 'html';
    return 'text';
  };
  const beginLargeDocumentImport = async (asset: DocumentPicker.DocumentPickerAsset, importDuplicate = false) => {
    const duplicate = importDuplicate ? undefined : findLikelyLargeDocumentDuplicate(asset.name, asset.size);
    if (duplicate) {
      Alert.alert('Already in your library', `${asset.name} looks like a document you already imported.`, [
        { text: 'Open existing', onPress: () => { const existing = items.find((item) => item.id === duplicate.documentId); if (existing) openItem(existing); } },
        { text: 'Import another copy', onPress: () => { void beginLargeDocumentImport(asset, true); } }, { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    setIsPreparing(true);
    try {
      const now = Date.now(); const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      const sourceUri = await copyLargeDocumentToManagedStorage(id, asset.uri, asset.name, asset.size);
      const sourceSize = asset.size ?? new File(sourceUri).size;
      const info = createLargeDocumentInfo({ documentId: id, originalFileName: asset.name, sourceUri, format: largeDocumentFormatFor(asset.name), mimeType: asset.mimeType ?? undefined, fileSize: sourceSize, status: 'queued' });
      const item = makeItem('', 'document', asset.name.replace(/\.[^.]+$/, ''), undefined, undefined, { sourceType: documentSourceType(asset.name), extractionMethod: 'chunked-import', sourceUri, storageMode: 'chunked', processingStatus: 'queued', fileSize: sourceSize });
      const stored: LibraryItem = { ...item, id };
      saveLargeDocumentInfo(info); persist(stored); setPrepared({ item: stored, message: 'Preparing your document in sections. Playback can begin as soon as the first section is ready.' });
      void processLargeDocument(id, () => refreshLargeImport(id));
    } catch (error) { Alert.alert('Couldn’t prepare this file', safeDocumentError(error, 'Your original file is safe. Try again after freeing storage.')); }
    finally { setIsPreparing(false); }
  };
  const beginRemoteDocumentImport = async (url: URL, route: DirectDocumentRoute, expectedSize?: number, mimeType?: string) => {
    try {
      const now = Date.now(); const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      const sourceUri = await downloadRemoteDocumentToManagedStorage(id, url.toString(), route.fileName, expectedSize);
      const fileSize = new File(sourceUri).size;
      const info = createLargeDocumentInfo({ documentId: id, originalFileName: route.fileName, sourceUri, format: largeDocumentFormatFor(route.fileName), mimeType, fileSize, status: 'queued' });
      const item = makeItem('', 'document', route.fileName.replace(/\.[^.]+$/, ''), url.hostname, url.toString(), { sourceType: documentSourceType(route.fileName), extractionMethod: 'direct-document-link', sourceUri, storageMode: 'chunked', processingStatus: 'queued', fileSize });
      const stored: LibraryItem = { ...item, id };
      saveLargeDocumentInfo(info); persist(stored); setPrepared({ item: stored, message: 'Downloading complete. Your document is preparing in sections.' });
      void processLargeDocument(id, () => refreshLargeImport(id));
      return true;
    } catch (error) {
      Alert.alert('Couldn’t import this document', safeDocumentError(error, 'Try another public document link.'));
      return false;
    }
  };
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: [...IMPORT_PICKER_TYPES], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    await beginLargeDocumentImport(asset);
  };

  const importImageText = async (source: 'library' | 'camera') => {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { Alert.alert('Camera access is needed', 'Allow camera access to scan text on this iPhone.'); return; }
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsMultipleSelection: true });
    if (result.canceled) return;
    setIsPreparing(true);
    try {
      const recognized: string[] = [];
      for (const asset of result.assets) { const lines = await recognizeImageText(asset.uri); recognized.push(...lines, ''); }
      const text = cleanText(recognized.join('\n'));
      if (countWords(text) < 2) throw new Error('No readable text was found in that image.');
      setOcrDraft({ text, title: source === 'camera' ? (result.assets.length > 1 ? `Scan (${result.assets.length} pages)` : 'Scanned text') : 'Text from photo', source, sourceUri: result.assets[0].uri });
    } catch (error) {
      Alert.alert('Couldn’t read that image', error instanceof Error ? error.message : 'Try a sharper image with clearer text.');
    } finally { setIsPreparing(false); }
  };
  const saveOcrDraft = useCallback(() => {
    if (!ocrDraft) return;
    const text = cleanText(ocrDraft.text); if (countWords(text) < 2) { Alert.alert('Review the scan', 'Soundoc could not find enough readable text to save.'); return; }
    const sourceType = ocrDraft.source === 'camera' ? 'scan' : 'image';
    const longText = shouldUseChunkedText(text);
    const item = longText
      ? queueLongText({ text, title: ocrDraft.title, itemType: 'document', sourceType, extractionMethod: 'ocr', extractionConfidence: countWords(text) < 15 ? 0.55 : 0.85, extractionWarnings: countWords(text) < 15 ? ['OCR text is short; review it before listening.'] : [] })
      : makeItem(text, 'document', ocrDraft.title, undefined, undefined, { sourceType, extractionMethod: 'ocr', extractionConfidence: countWords(text) < 15 ? 0.55 : 0.85, extractionWarnings: countWords(text) < 15 ? ['OCR text is short; review it before listening.'] : [], sourceUri: ocrDraft.sourceUri });
    if (!longText) persist(item);
    setOcrDraft(null); setPrepared({ item, message: longText ? 'Preparing scanned text in sections. You can listen as soon as the first section is ready.' : 'Review complete. Text found on your iPhone and ready to listen.' });
  }, [makeItem, ocrDraft, persist, queueLongText]);

  const playPrepared = () => {
    if (!prepared) return;
    player.load(prepared.item, true); setPrepared(null); setScreen('player');
  };
  const saveArticlePreview = (extraction: ArticleExtraction) => {
    const longText = shouldUseChunkedText(extraction.text);
    const item = longText
      ? queueLongText({ text: extraction.text, title: extraction.title, itemType: 'article', source: extraction.sourceDomain, sourceUrl: extraction.sourceUrl, sourceType: 'url', extractionMethod: `article-${extraction.method}`, extractionConfidence: extraction.confidence, extractionWarnings: extraction.warnings, format: 'Web article' })
      : makeItem(extraction.text, 'article', extraction.title, extraction.sourceDomain, extraction.sourceUrl, extraction as Partial<LibraryItem>);
    if (!longText) persist(item);
    setArticlePreview(null); setPrepared({ item, message: longText ? `Preparing ${extraction.sourceDomain} in sections. You can listen as soon as the first section is ready.` : `Cleaned from ${extraction.sourceDomain} and ready to listen.` });
  };
  const editArticlePreview = (extraction: ArticleExtraction) => {
    setArticlePreview(null); setDraftText(extraction.text); setDraftTitle(extraction.title ?? ''); setDraftLink(extraction.sourceUrl ?? ''); setImportMode('text');
  };
  const openItem = (item: LibraryItem, autoplay = false) => { player.load(item, autoplay); setScreen('player'); };
  const viewSource = useCallback((item: LibraryItem) => {
    const sourceUrl = originalSourceUrl(item);
    if (shouldOpenOriginalWebPage(item) && sourceUrl) {
      void Linking.openURL(sourceUrl).catch(() => setSourceReaderItemId(item.id));
      return;
    }
    setSourceReaderItemId(item.id);
  }, []);
  const finishOnboarding = () => { void AsyncStorage.setItem('soundoc.onboarding.complete', 'true').catch(() => undefined); setOnboardingComplete(true); };
  const showOnboardingAgain = () => setOnboardingComplete(false);
  const openQueueItem = (item: LibraryItem) => { player.load(item, true); setShowQueue(false); setScreen('player'); };
  const openBookmarks = useCallback(() => { setBookmarks(player.item ? listBookmarks(player.item.id) : listBookmarks()); setDocumentChapters(player.item?.storageMode === 'chunked' ? listDocumentChapters(player.item.id) : []); setShowBookmarks(true); }, [player.item]);
  const addBookmark = useCallback((note?: string) => {
    const active = player.item; if (!active) return;
    const now = Date.now(); const bookmark: Bookmark = { id: `bookmark-${now}-${Math.random().toString(36).slice(2, 7)}`, libraryItemId: active.id, sectionId: active.currentSectionId, paragraphIndex: active.currentParagraphIndex, sentenceIndex: active.sentenceIndex, note: note?.trim() || undefined, createdAt: now, updatedAt: now };
    saveBookmark(bookmark); setBookmarks((current) => [...current, bookmark].sort((a, b) => a.sentenceIndex - b.sentenceIndex));
  }, [player.item]);
  const addHighlight = useCallback((sentenceIndex: number) => {
    const active = player.item; const sentence = player.sentences[sentenceIndex]; if (!active || !sentence) return;
    const startOffset = player.sentences.slice(0, sentenceIndex).reduce((total, value) => total + value.length + 1, 0); const now = Date.now();
    saveHighlight({ id: `highlight-${now}-${Math.random().toString(36).slice(2, 7)}`, libraryItemId: active.id, sectionId: active.currentSectionId, startOffset, endOffset: startOffset + sentence.length, text: sentence, createdAt: now, updatedAt: now });
    Alert.alert('Saved highlight', 'This highlight is stored separately from the cleaned text.');
  }, [player.item, player.sentences]);
  const removeBookmark = useCallback((bookmark: Bookmark) => { deleteBookmark(bookmark.id); setBookmarks((current) => current.filter((entry) => entry.id !== bookmark.id)); }, []);
  const jumpToSection = useCallback((sectionIndex: number) => {
    const active = player.item; const section = active?.sections?.[sectionIndex]; if (!active || !section) return;
    const probe = section.text.trim().slice(0, 48).toLowerCase(); const target = player.sentences.findIndex((sentence) => sentence.toLowerCase().includes(probe) || probe.includes(sentence.toLowerCase().slice(0, 48)));
    if (target >= 0) player.jump(target - active.sentenceIndex);
    setShowBookmarks(false);
  }, [player]);
  const deleteItem = (item: LibraryItem) => Alert.alert('Delete this item?', 'Its saved text and listening position will be removed from Soundoc.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { if (player.item?.id === item.id) player.clear(); deleteManagedDocumentFile(item.sourceUri); removeItem(item.id); setItems((all) => all.filter((entry) => entry.id !== item.id)); updateQueue(queueIds.filter((id) => id !== item.id)); } },
  ]);
  const itemActions = (item: LibraryItem) => Alert.alert(item.title, undefined, [
    ...(item.storageMode === 'chunked' && ['queued', 'analyzing', 'processing', 'partiallyReady'].includes(item.processingStatus ?? '') ? [{ text: 'Pause preparation', onPress: () => { pauseLargeDocumentProcessing(item.id); } }] : []),
    ...(item.storageMode === 'chunked' && item.processingStatus === 'paused' ? [{ text: 'Resume preparation', onPress: () => { void processLargeDocument(item.id, () => refreshLargeImport(item.id)); } }] : []),
    ...(item.storageMode === 'chunked' && item.processingStatus === 'failed' ? [{ text: 'Retry preparation', onPress: () => { void processLargeDocument(item.id, () => refreshLargeImport(item.id)); } }] : []),
    { text: 'Play next', onPress: () => addToQueue(item, true) },
    { text: 'Save for later', onPress: () => addToQueue(item) },
    { text: 'Delete', style: 'destructive', onPress: () => deleteItem(item) },
    { text: 'Cancel', style: 'cancel' },
  ]);

  return (
    <SafeAreaProvider><SafeAreaView style={styles.app} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      {onboardingComplete === null ? <LoadingScreen /> : <>
      {screen === 'home' && <HomeScreen items={recentItems} readyListeningSeconds={readyListeningSeconds} continueItem={continueItem} queue={queue} onOpenQueue={() => setShowQueue(true)} onImport={openImport} onUpload={pickDocument} onPhoto={() => importImageText('library')} onCamera={() => importImageText('camera')} onContinue={() => continueItem && openItem(continueItem, true)} onOpen={openItem} onOpenImportInfo={() => setShowImportCapabilities(true)} />}
      {screen === 'library' && <LibraryScreen items={items} playlists={playlists} onShowPlaylists={() => setShowPlaylists(true)} onOpen={openItem} onDelete={itemActions} onToggleFavorite={(item) => { const next = { ...item, favorite: !item.favorite, updatedAt: Date.now() }; persist(next); }} />}
      {screen === 'settings' && <SettingsScreen defaults={listeningDefaults} activeItem={player.item} voices={player.voices} goldenProfile={goldenProfile} showGoldenFeedback={showGoldenFeedback} analytics={analytics} reduceEffects={reduceEffects} onReduceEffects={setReduceEffects} onUpdateSettings={updateListeningSettings} onGoldenGood={handleGoldenGood} onGoldenNotQuite={handleGoldenNotQuite} onGoldenReason={handleGoldenReason} onDismissGoldenFeedback={handleGoldenFeedbackDismiss} onResetGoldenProfile={() => { handleGoldenProfileReset(); updateListeningSettings(applyGoldenPreset()); }} onUndoGoldenAdjustment={handleGoldenUndo} onPreviewVoice={player.preview} onStopPreview={player.stopPreview} onShowQueue={() => setShowQueue(true)} onShowOnboarding={showOnboardingAgain} onOpenFeedback={() => setShowFeedback(true)} onOpenLegal={openLegal} />}
      {screen === 'player' && <PlayerScreen player={player} preferences={listeningDefaults} reduceMotion={reduceEffects} hasSummary={Boolean(summary)} freeListening={subscription.isFree ? { remainingSeconds: subscription.freeListeningSecondsRemaining, resetLabel: subscription.freeResetLabel ?? 'Resets Monday', critical: subscription.freeListeningSecondsRemaining <= FREE_CRITICAL_ALLOWANCE_SECONDS } : null} onOpenFreePlan={subscription.openPaywall} showGoldenFeedback={isGoldenPresetActive(listeningDefaults) && showGoldenFeedback} onGoldenGood={handleGoldenGood} onGoldenNotQuite={handleGoldenNotQuite} onGoldenReason={handleGoldenReason} onDismissGoldenFeedback={handleGoldenFeedbackDismiss} onOpenSummary={() => setShowSummary(true)} onOpenLearning={openLearningTools} onOpenBookmarks={openBookmarks} onBookmark={() => addBookmark()} onHighlight={addHighlight} onUpdateSettings={updateListeningSettings} onOpenModeSelector={() => setShowModeSelector(true)} onViewSource={() => viewSource(player.item!)} onClose={() => setScreen('home')} onOpenLibrary={() => setScreen('library')} onOpenImport={() => openImport('text')} showControls={showControls} setShowControls={setShowControls} showListeningStudio={showListeningStudio} setShowListeningStudio={setShowListeningStudio} showVoicePicker={showVoicePicker} setShowVoicePicker={setShowVoicePicker} />}

      {screen !== 'player' && player.item && dismissedMiniPlayerItemId !== player.item.id && <MiniPlayer item={player.item} state={player.state} onPress={() => setScreen('player')} onToggle={() => player.state === 'playing' ? player.pause() : player.play()} onStopListening={dismissListeningSession} />}
      <TabBar screen={screen} onChange={openScreen} miniPlayer={Boolean(player.item)} />

      <ImportModal mode={importMode} text={draftText} link={draftLink} title={draftTitle} busy={isPreparing} onText={setDraftText} onLink={setDraftLink} onTitle={setDraftTitle} onClose={() => setImportMode(null)} onPaste={pasteFromClipboard} onSubmit={importMode === 'text' ? prepareText : prepareLink} />
      <ArticlePreviewModal extraction={articlePreview} onClose={() => setArticlePreview(null)} onEdit={editArticlePreview} onContinue={saveArticlePreview} />
      <OcrPreviewModal draft={ocrDraft} onClose={() => setOcrDraft(null)} onSave={saveOcrDraft} onChange={(next) => setOcrDraft((current) => current ? { ...current, ...next } : current)} />
      <PreparedModal prepared={prepared} onClose={() => setPrepared(null)} onPlay={playPrepared} onRetry={() => { if (prepared?.item.storageMode === 'chunked') void processLargeDocument(prepared.item.id, () => refreshLargeImport(prepared.item.id)); }} onPlayNext={() => { if (prepared) addToQueue(prepared.item, true); setPrepared(null); }} onAddToQueue={() => { if (prepared) addToQueue(prepared.item); setPrepared(null); }} />
      <ImportCapabilitiesModal visible={showImportCapabilities} onClose={() => setShowImportCapabilities(false)} />
      <QueueModal visible={showQueue} items={queue} onClose={() => setShowQueue(false)} onOpen={openQueueItem} onRemove={(item) => updateQueue(queueIds.filter((id) => id !== item.id))} onClear={() => updateQueue([])} />
      <PlaylistModal visible={showPlaylists} playlists={playlists} items={items} onClose={() => setShowPlaylists(false)} onCreate={addPlaylist} onRename={editPlaylistName} onDelete={removePlaylist} onUpdateItems={updatePlaylistItems} onPlay={openItem} />
      <SubscriptionPaywall onOpenLegal={openLegal} />
      <FreeListeningModal kind={freeListeningModal} remainingSeconds={subscription.freeListeningSecondsRemaining} resetLabel={subscription.freeResetLabel ?? 'Resets Monday'} readyListeningSeconds={readyListeningSeconds} onUpgrade={() => { setFreeListeningModal(null); subscription.openPaywall(); }} onDismiss={() => setFreeListeningModal(null)} onLibrary={() => { setFreeListeningModal(null); setScreen('library'); }} />
      <SourceReaderScreen visible={sourceReaderItemId === player.item?.id} item={player.item} playerState={player.state} onTogglePlayback={() => player.state === 'playing' ? player.pause() : player.play()} onClose={() => setSourceReaderItemId(null)} />
      <ListeningModeSheet visible={showModeSelector} preferences={listeningDefaults} voices={player.voices} activeItem={player.item} onClose={() => setShowModeSelector(false)} onApply={updateListeningSettings} onPreview={player.preview} onStopPreview={player.stopPreview} />
      <SummaryModal visible={showSummary} item={player.item} summary={summary} busy={summaryBusy} progress={summaryProgress} privacyDescription={getPrivacyDescription()} onClose={() => setShowSummary(false)} onGenerate={generateSummary} onCancel={cancelSummaryGeneration} onListen={(text) => player.playText(text, player.item?.language)} onDelete={deleteSummary} />
      <LearningToolsModal visible={showLearningTools} initialTab={learningStartTab} item={player.item} question={learningQuestion} passages={learningPassages} answer={learningAnswer} explanation={learningExplanation} cards={learningCards} review={learningReview} podcast={learningPodcast} academic={academic} spokenPreview={spokenPreview} busy={learningBusy} onClose={() => setShowLearningTools(false)} onAsk={askActiveDocument} onExplain={explainActivePassage} onCreateCards={createLearningCards} onCreatePodcast={createPodcast} onListen={(text) => player.playConversation(text.split(/\n\n+/).filter(Boolean).map((part, index) => ({ speaker: index % 2 ? 'Guest' : 'Host', text: part.replace(/^(Host|Guest):\s*/i, '') })), player.item?.language)} onListenConversation={(turns) => player.playConversation(turns)} />
      <BookmarksModal visible={showBookmarks} item={player.item} bookmarks={bookmarks.filter((bookmark) => !player.item || bookmark.libraryItemId === player.item.id)} chapters={documentChapters} onClose={() => setShowBookmarks(false)} onJump={(bookmark) => { if (player.item?.id === bookmark.libraryItemId) { player.jump(bookmark.sentenceIndex - player.item.sentenceIndex); setShowBookmarks(false); } }} onJumpSection={jumpToSection} onJumpChapter={(chapter) => { player.jumpToChunk(chapter.sequence); setShowBookmarks(false); }} onDelete={removeBookmark} onCreateNote={addBookmark} />
      <FeedbackCenter visible={showFeedback} onClose={() => setShowFeedback(false)} />
      {onboardingComplete === false && <OnboardingModal onDone={finishOnboarding} />}
      {isPreparing && <LoadingScreen overlay label="Preparing your listening copy" detail="Cleaning the text and arranging it for a smooth read." />}
      </>}
    </SafeAreaView></SafeAreaProvider>
  );
}

export default function App() {
  return <SubscriptionProvider><SoundocApp /></SubscriptionProvider>;
}

function HomeScreen({ items, readyListeningSeconds, continueItem, queue, onOpenQueue, onImport, onUpload, onPhoto, onCamera, onContinue, onOpen, onOpenImportInfo }: { items: LibraryItem[]; readyListeningSeconds: number; continueItem?: LibraryItem; queue: LibraryItem[]; onOpenQueue: () => void; onImport: (mode: ImportMode) => void; onUpload: () => void; onPhoto: () => void; onCamera: () => void; onContinue: () => void; onOpen: (item: LibraryItem) => void; onOpenImportInfo: () => void }) {
  return <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.brandRow}><View><Text style={styles.brandMark}>Soundoc</Text><Text style={styles.eyebrow}>PRIVATE LISTENING</Text></View><View style={styles.privacy}><Text style={styles.privacyIcon}>⌁</Text><Text style={styles.privacyText}>On your iPhone</Text></View></View>
    <Text style={styles.display}>{copy.homeTitle}</Text><Text style={styles.intro}>{copy.homeSubtitle}</Text>
    <SubscriptionStatusCard readyListeningSeconds={readyListeningSeconds} />
    <View style={styles.importGroup}>
      <ImportButton symbol="T" title="Paste Text" description="Long manuscripts welcome" onPress={() => onImport('text')} primary />
      <ImportButton symbol="↗" title="Web Article or Link" description="Articles & direct document links" onPress={() => onImport('link')} />
      <ImportButton symbol="⌁" title="PDF & Documents" description="Books, textbooks & large documents" onPress={onUpload} />
      <Pressable onPress={onOpenImportInfo} style={({ pressed }) => [styles.importInfoLink, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="What can I import?" accessibilityHint="Shows supported file types and how larger reading is prepared"><Text style={styles.importInfoIcon}>ⓘ</Text><Text style={styles.importInfoText}>What can I import?</Text><Text style={styles.importInfoChevron}>›</Text></Pressable>
    </View>
    {continueItem && <View style={styles.continueDivider} accessibilityElementsHidden><View style={styles.importDividerRule} /></View>}
    {continueItem ? <><Text style={[styles.sectionTitle, styles.continueTitle]}>Continue listening</Text><Pressable style={styles.continueCard} onPress={onContinue} accessibilityRole="button" accessibilityLabel={`Continue ${continueItem.title}`}><View style={styles.continueTop}><SourceMark item={continueItem} /><View style={styles.grow}><Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{continueItem.title}</Text><Text style={styles.meta}>{continueItem.source || typeLabel(continueItem.type)}</Text></View><Text style={styles.playSmall}>▶</Text></View><Progress value={continueItem.progress} /><Text style={styles.remaining}>{Math.round(continueItem.progress * 100)}% complete · {formatDuration(estimateSeconds(continueItem.wordCount * (1 - continueItem.progress), continueItem.rate)).replace('About ', '')} left</Text></Pressable></> : <EmptyState onPress={() => onImport('text')} />}
    {queue.length > 0 && <Pressable style={styles.queuePreview} onPress={onOpenQueue} accessibilityRole="button" accessibilityLabel={`Open listening queue, ${queue.length} items`}><View style={styles.queuePreviewIcon}><Text style={styles.queuePreviewGlyph}>☷</Text></View><View style={styles.grow}><Text style={styles.queuePreviewTitle}>Your listening queue</Text><Text style={styles.queuePreviewMeta}>{queue.length} {queue.length === 1 ? 'item' : 'items'} · {formatDuration(queue.reduce((seconds, item) => seconds + estimateSeconds(item.wordCount * (1 - item.progress), item.rate), 0)).replace('About ', '')}</Text></View><Text style={styles.rowChevron}>›</Text></Pressable>}
    {items.length > 0 && <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recently added</Text><Text style={styles.allLabel}>{items.length} saved</Text></View>{items.slice(0, 3).map((item) => <ItemRow key={item.id} item={item} onPress={() => onOpen(item)} />)}</>}
    <View style={[styles.importDivider, styles.importDividerSpaced]} accessibilityElementsHidden><View style={styles.importDividerRule} /></View>
    <View style={styles.otherImports}><Text style={styles.otherImportsLabel}>CAMERA & PHOTOS</Text><View style={styles.otherImportActions}><Pressable style={({ pressed }) => [styles.otherImportButton, styles.otherImportRaised, pressed && styles.importButtonPressed]} onPress={onCamera} accessibilityLabel="Scan text with camera"><Text style={styles.otherImportIcon}>⌗</Text><Text style={styles.otherImportText}>Scan page</Text></Pressable><Pressable style={({ pressed }) => [styles.otherImportButton, styles.otherImportRaised, pressed && styles.importButtonPressed]} onPress={onPhoto} accessibilityLabel="Import text from a photo"><Text style={styles.otherImportIcon}>▧</Text><Text style={styles.otherImportText}>Choose photo</Text></Pressable></View></View>
    <RaisedGraphiteCard style={styles.importCoverage}>
      <View style={styles.importCoverageHeader}>
        <Text style={styles.importCoverageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Ready for real reading</Text>
        <View style={styles.importCoverageKicker}><Text style={styles.importCoverageKickerText}>ON DEVICE</Text></View>
      </View>
      <View style={styles.importFormatRow}>{['PDF', 'DOCX', 'TXT', 'MD', 'HTML', 'RTF', 'EPUB'].map((format) => <View key={format} style={styles.importFormat}><Text style={styles.importFormatText}>{format}</Text></View>)}</View>
      <Text style={styles.importCoverageText}>Files stay private on your iPhone. iCloud Drive and other providers are available through the Files picker.</Text>
    </RaisedGraphiteCard>
  </ScrollView>;
}

function ImportButton({ symbol, title, description, onPress, primary = false }: { symbol: string; title: string; description: string; onPress: () => void; primary?: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.importButton, styles.importRaised, primary && styles.importPrimary, pressed && styles.importButtonPressed]} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={description}>
    <View style={[styles.importIcon, primary && styles.importIconPrimary]}><Text style={[styles.importSymbol, primary && styles.importSymbolPrimary]}>{symbol}</Text></View><View style={styles.grow}><Text style={[styles.importTitle, primary && styles.importTitlePrimary]}>{title}</Text><Text style={[styles.importDescription, primary && styles.importDescriptionPrimary]}>{description}</Text></View><Text style={[styles.chevron, primary && styles.chevronPrimary]}>›</Text>
  </Pressable>;
}

function ImportCapabilitiesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.importInfoModal}>
      <View style={styles.modalHeader}><View style={styles.grow}><Text style={styles.screenTitle}>What can I import?</Text><Text style={styles.screenSubtitle}>Simple enough for an article. Powerful enough for a book.</Text></View><Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close supported files"><Text style={styles.closeText}>Done</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.importInfoScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.importInfoHero}><View style={styles.importInfoHeroIcon}><Text style={styles.importInfoHeroGlyph}>▤</Text></View><View style={styles.grow}><Text style={styles.importInfoHeroTitle}>One private reading library.</Text><Text style={styles.importInfoHeroText}>Every supported file is prepared in resume-safe sections, whether it is a short note or a full book.</Text></View></View>
        <Text style={styles.importInfoLabel}>SUPPORTED FILES</Text>
        <View style={styles.importInfoList}>{IMPORT_CAPABILITIES.map((capability) => <View key={capability.key} style={styles.importInfoRow}><View style={styles.importInfoFormat}><Text style={styles.importInfoFormatText}>{capability.key}</Text></View><View style={styles.grow}><Text style={styles.importInfoRowTitle}>{capability.title}</Text><Text style={styles.importInfoRowDetail}>{capability.detail}</Text><Text style={styles.importInfoCapacity}>{capability.capacity}</Text></View></View>)}</View>
        <View style={styles.largeInfoCard}><View style={styles.largeInfoIcon}><Text style={styles.largeInfoGlyph}>◷</Text></View><View style={styles.grow}><Text style={styles.largeInfoTitle}>{LARGE_DOCUMENT_COPY.title}</Text><Text style={styles.largeInfoText}>{LARGE_DOCUMENT_COPY.detail}</Text><Text style={styles.largeInfoNote}>Designed for full-length books and large documents. No numerical page-count claim is shown until that format is verified on-device.</Text></View></View>
        <View style={styles.scannedInfo}><Text style={styles.scannedInfoTitle}>Scanned PDFs</Text><Text style={styles.scannedInfoText}>{SCANNED_PDF_COPY} Soundoc still records the PDF’s actual page count when it can inspect the file.</Text></View>
        <Text style={styles.importPrivacyNote}>Files are prepared on your device. Importing a document does not use up your Free listening allowance.</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function EmptyState({ onPress }: { onPress: () => void }) { return <View style={styles.empty}><View style={styles.emptyWave}><Text style={styles.emptyPage}>▤</Text><Text style={styles.wave}>⌁⌁</Text></View><Text style={styles.emptyTitle}>Make time to listen.</Text><Text style={styles.emptyText}>Turn any article, document, or pasted text into something you can listen to.</Text><Pressable style={styles.textAction} onPress={onPress}><Text style={styles.textActionLabel}>Paste your first text</Text></Pressable></View>; }

function remainingListeningSeconds(item: LibraryItem) {
  if (item.storageMode === 'chunked' && item.estimatedDurationSeconds) return Math.max(0, item.estimatedDurationSeconds * Math.max(0, 1 - item.progress) / Math.max(0.1, item.rate));
  return estimateSeconds(item.wordCount * Math.max(0, 1 - item.progress), item.rate);
}

function longDocumentMeta(item: LibraryItem) {
  const pages = formatDocumentPages(item.pageCount, hasExactPageCount(item.sourceType)) ? `${formatDocumentPages(item.pageCount, hasExactPageCount(item.sourceType))} · ` : '';
  if (item.storageMode !== 'chunked') {
    if (!item.pageCount) return undefined;
    return `${pages}${formatDuration(remainingListeningSeconds(item)).replace('About ', '')} listening`;
  }
  if (item.processingStatus === 'needsOCR') return `${pages}Scanned document detected · OCR needed`;
  if (item.processingStatus === 'failed') return `${pages}Couldn’t finish preparing · Retry available`;
  if (item.processingStatus && item.processingStatus !== 'ready') return `${pages}Preparing · ${item.processedUnits?.toLocaleString() ?? 0}${item.totalUnits ? ` / ${item.totalUnits.toLocaleString()}` : ''} sections`;
  return `${pages}${displayDuration(item.estimatedDurationSeconds ?? estimateSeconds(item.wordCount, item.rate)).replace('About ', '')} listening`;
}

function displayDuration(seconds: number) {
  return seconds > 0 ? formatDuration(seconds).replace('About ', '') : 'No listening time yet';
}

function playlistListeningSeconds(playlist: Playlist, items: LibraryItem[]) {
  return playlist.itemIds.reduce((total, itemId) => {
    const item = items.find((candidate) => candidate.id === itemId);
    return total + (item ? remainingListeningSeconds(item) : 0);
  }, 0);
}

function EstimateBadge({ seconds, label = 'EST. LISTENING TIME' }: { seconds: number; label?: string }) {
  return <View style={styles.estimateBadge} accessibilityLabel={`${label}: ${displayDuration(seconds)}`}><Text style={styles.estimateIcon}>◷</Text><View><Text style={styles.estimateCopy}>{label}</Text><Text style={styles.estimateValue}>{displayDuration(seconds)}</Text></View></View>;
}

function LibraryScreen({ items, playlists, onShowPlaylists, onOpen, onDelete, onToggleFavorite }: { items: LibraryItem[]; playlists: Playlist[]; onShowPlaylists: () => void; onOpen: (item: LibraryItem, autoplay?: boolean) => void; onDelete: (item: LibraryItem) => void; onToggleFavorite: (item: LibraryItem) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'recent' | 'progress' | 'completed' | 'favorite' | 'queue'>('all');
  const [sort, setSort] = useState<'date' | 'title' | 'progress' | 'length'>('date');
  const filtered = items.filter((item) => `${item.title} ${item.author ?? ''} ${item.source ?? ''} ${item.sections?.map((section) => section.title).join(' ') ?? ''} ${item.text}`.toLowerCase().includes(query.toLowerCase())).filter((item) => filter === 'all' || filter === 'recent' || filter === 'progress' && item.progress > 0 && !item.completed || filter === 'completed' && item.completed || filter === 'favorite' && item.favorite || filter === 'queue' && item.queuePosition !== undefined).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'progress' ? b.progress - a.progress : sort === 'length' ? b.wordCount - a.wordCount : b.updatedAt - a.updatedAt);
  return <View style={styles.fullScreen}><View style={styles.libraryHeader}><View style={styles.libraryTitleRow}><View style={styles.libraryTitleCopy}><Text style={styles.screenTitle}>Library</Text><Text style={styles.screenSubtitle}>Everything stays on this device.</Text></View><Pressable style={({ pressed }) => [styles.libraryPlaylistButton, pressed && styles.pressed]} onPress={onShowPlaylists} accessibilityLabel={`Open playlists, ${playlists.length} playlists`}><Text style={styles.libraryPlaylistIcon}>☷</Text><Text style={styles.libraryPlaylistLabel}>Playlists</Text></Pressable></View><View style={styles.search}><Text style={styles.searchIcon}>⌕</Text><TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search your listening" placeholderTextColor={colors.textTertiary} accessibilityLabel="Search your library" /></View></View>
    <View style={styles.libraryFilters}>{(['all', 'recent', 'progress', 'completed', 'favorite', 'queue'] as const).map((value) => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.libraryFilter, filter === value && styles.libraryFilterSelected]}><Text style={[styles.libraryFilterText, filter === value && styles.libraryFilterTextSelected]}>{value === 'progress' ? 'In progress' : value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</View><View style={styles.librarySorts}>{(['date', 'title', 'progress', 'length'] as const).map((value) => <Pressable key={value} onPress={() => setSort(value)}><Text style={[styles.librarySortText, sort === value && styles.librarySortSelected]}>{value === 'date' ? 'Recent' : value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</View><FlatList data={filtered} keyExtractor={(item) => item.id} contentContainerStyle={styles.libraryList} ListEmptyComponent={<View style={styles.libraryEmpty}><Text style={styles.emptyTitle}>Your library is quiet.</Text><Text style={styles.emptyText}>Items you save will appear here.</Text></View>} renderItem={({ item }) => <ItemRow item={item} onPress={() => onOpen(item, true)} onLongPress={() => onDelete(item)} onToggleFavorite={() => onToggleFavorite(item)} />} />
  </View>;
}

function PlayerScreen({ player, preferences, reduceMotion, hasSummary, freeListening, onOpenFreePlan, showGoldenFeedback, onGoldenGood, onGoldenNotQuite, onGoldenReason, onDismissGoldenFeedback, onOpenSummary, onOpenLearning, onOpenBookmarks, onBookmark, onHighlight, onUpdateSettings, onOpenModeSelector, onViewSource, onClose, onOpenLibrary, onOpenImport, showControls, setShowControls, showListeningStudio, setShowListeningStudio, showVoicePicker, setShowVoicePicker }: { player: ReturnType<typeof useSpeechPlayer>; preferences: ListeningSettings; reduceMotion: boolean; hasSummary: boolean; freeListening: { remainingSeconds: number; resetLabel: string; critical: boolean } | null; onOpenFreePlan: () => void; showGoldenFeedback: boolean; onGoldenGood: () => void; onGoldenNotQuite: () => void; onGoldenReason: (reason: GoldenFeedbackReason) => void; onDismissGoldenFeedback: () => void; onOpenSummary: () => void; onOpenLearning: (tab?: LearningToolTab) => void; onOpenBookmarks: () => void; onBookmark: () => void; onHighlight: (sentenceIndex: number) => void; onUpdateSettings: (settings: Partial<ListeningSettings>) => void; onOpenModeSelector: () => void; onViewSource: () => void; onClose: () => void; onOpenLibrary: () => void; onOpenImport: () => void; showControls: boolean; setShowControls: (value: boolean) => void; showListeningStudio: boolean; setShowListeningStudio: (value: boolean) => void; showVoicePicker: boolean; setShowVoicePicker: (value: boolean) => void }) {
  const item = player.item;
  if (!item) return <View style={styles.playerScreen}><View style={styles.playerHeader}><View style={styles.playerHeadText}><Text style={styles.playerHeadKicker}>PLAYER</Text><Text style={styles.playerTitle}>Now Playing</Text></View><TactileIconButton icon="⌁" label="Open library" size={44} onPress={onOpenLibrary} /></View><View style={styles.playerEmpty}><RaisedGraphiteCard style={styles.playerEmptyCard}><View style={styles.emptyArtwork}><Text style={styles.emptyArtworkGlyph}>◖</Text><Text style={styles.emptyArtworkWave}>⌁</Text></View><Text style={styles.playerEmptyTitle}>Nothing ready to play</Text><Text style={styles.playerEmptyText}>Choose something from your library or add text to start listening.</Text><View style={styles.playerEmptyActions}><Pressable style={({ pressed }) => [styles.playerEmptyPrimary, pressed && styles.playerEmptyPressed]} onPress={onOpenLibrary}><Text style={styles.playerEmptyPrimaryText}>Open Library</Text><Text style={styles.playerEmptyArrow}>›</Text></Pressable><Pressable style={({ pressed }) => [styles.playerEmptySecondary, pressed && styles.playerEmptyPressed]} onPress={onOpenImport}><Text style={styles.playerEmptySecondaryText}>Paste text</Text></Pressable></View></RaisedGraphiteCard></View></View>;
  const voice = player.voices.find((candidate) => candidate.identifier === item.selectedVoice);
  const [showReadAlong, setShowReadAlong] = useState(false);
  useEffect(() => { setShowReadAlong(false); }, [item.id]);
  const currentSentence = player.sentences[item.sentenceIndex] || (item.storageMode === 'chunked' && item.processingStatus !== 'ready' ? 'Preparing the next section. Soundoc will continue automatically when it is ready.' : 'Ready when you are.');
  const sections = item.sections ?? [];
  const matchedSectionIndex = sections.findIndex((section) => section.id === item.currentSectionId);
  const activeSectionIndex = matchedSectionIndex >= 0 ? matchedSectionIndex : sections.length ? Math.min(sections.length - 1, Math.floor((item.sentenceIndex / Math.max(1, player.sentences.length)) * sections.length)) : -1;
  const activeSection = activeSectionIndex >= 0 ? sections[activeSectionIndex] : undefined;
  const sectionCharacters = sections.reduce((total, section) => total + Math.max(1, section.text.length), 0);
  const sectionStartCharacters = activeSectionIndex >= 0 ? sections.slice(0, activeSectionIndex).reduce((total, section) => total + Math.max(1, section.text.length), 0) : 0;
  const rawSectionStart = activeSection && sectionCharacters > 0 ? Math.floor((sectionStartCharacters / sectionCharacters) * player.sentences.length) : Math.max(0, item.sentenceIndex - 3);
  const rawSectionEnd = activeSection && sectionCharacters > 0 ? Math.ceil(((sectionStartCharacters + activeSection.text.length) / sectionCharacters) * player.sentences.length) : Math.min(player.sentences.length, item.sentenceIndex + 4);
  const previewLimit = 28;
  const sectionStart = Math.max(0, Math.min(rawSectionStart, item.sentenceIndex - 4, Math.max(0, rawSectionEnd - previewLimit)));
  const sectionEnd = Math.min(player.sentences.length, Math.max(rawSectionEnd, item.sentenceIndex + 1, sectionStart + 1), sectionStart + previewLimit);
  const navigationTargets = useMemo(() => item.storageMode === 'chunked'
    ? navigationMarkersFromChapters(listDocumentChapters(item.id), getDocumentChunkCount(item.id))
    : navigationMarkersFromSections(sections), [item.id, item.processingStatus, item.processedUnits, item.storageMode, sections]);
  const navigationMarkers = useMemo(() => visibleNavigationMarkers(navigationTargets), [navigationTargets]);
  const navigationDurationSeconds = item.estimatedDurationSeconds ?? estimateSeconds(item.wordCount, item.rate);
  const navigationContext = {
    currentLabel: player.chapterTitle ?? activeSection?.title,
    preparingLabel: item.storageMode === 'chunked' && item.processingStatus && item.processingStatus !== 'ready' ? `Preparing · ${item.processedUnits?.toLocaleString() ?? 0} sections ready` : undefined,
  };
  const modeLabel = modeSummary(preferences, item).split(' — ')[0] || 'Custom';
  return <View style={[styles.playerScreen, styles.playerScreenCompact]}>
    <View style={styles.playerHeader}><TactileIconButton icon="⌄" label="Close player" size={44} onPress={onClose} /><View style={styles.playerHeadText}><View style={styles.playerKickerRow}><Text style={styles.playerHeadKicker}>NOW PLAYING</Text>{freeListening && <FreeListeningPlayerPill remainingLabel={formatFreeListeningRemaining(freeListening.remainingSeconds)} resetLabel={freeListening.resetLabel} critical={freeListening.critical} onPress={onOpenFreePlan} reduceMotion={reduceMotion} />}</View><MarqueeText text={item.title} containerStyle={{ alignSelf: 'stretch', marginTop: 1 }} textStyle={[styles.playerTitle, { fontSize: 16, lineHeight: 21 }]} /></View><Pressable style={styles.playerModePill} onPress={onOpenModeSelector} accessibilityRole="button" accessibilityLabel={`Listening mode, ${modeSummary(preferences, item)}`}><Text style={styles.playerModeKicker}>MODE</Text><Text style={{ ...type.label, color: colors.textPrimary, marginTop: 2 }} numberOfLines={1}>{modeLabel}</Text></Pressable></View>
    <ScrollView style={[styles.playerScroll, styles.playerScrollCompact]} contentContainerStyle={[styles.playerContent, styles.playerContentCompact]} showsVerticalScrollIndicator={false}>
      <RaisedGraphiteCard style={[styles.playerArtwork, styles.playerArtworkCompact]}>
        <View style={styles.artworkTop}><View style={styles.artworkBadge}><Text style={styles.artworkBadgeText}>{item.type === 'article' ? 'ARTICLE' : item.type === 'document' ? 'DOCUMENT' : 'TEXT'}</Text></View><Text style={styles.artworkStatus}>{item.storageMode === 'chunked' && item.processingStatus && item.processingStatus !== 'ready' ? 'PREPARING' : player.state === 'playing' ? 'PLAYING' : 'PAUSED'}</Text></View>
        <Pressable onPress={onViewSource} hitSlop={10} style={({ pressed }) => [styles.artworkMark, styles.artworkMarkCompact, styles.artworkMarkAction, pressed && styles.artworkMarkPressed]} accessibilityRole="button" accessibilityLabel={`View source for ${item.title}`} accessibilityHint="Opens the original source when available, otherwise saved readable text"><Text style={[styles.artworkGlyph, styles.artworkGlyphCompact]}>↗</Text><Text style={styles.artworkWave}>⌁</Text></Pressable>
        <Text style={styles.artworkTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.artworkSource}>{item.source || 'Saved on this iPhone'}</Text>
        <AudioWaveform progress={item.progress} active={player.state === 'playing'} compact />
        <SegmentedControlDial value={item.progress * 100} onChange={(percentage) => player.seekToNormalizedPosition(percentage / 100)} compact showTimeline={false} showContextLabel={false} quietContext markers={navigationMarkers} jumpTargets={navigationTargets} context={navigationContext} totalDurationSeconds={navigationDurationSeconds} reduceMotion={reduceMotion} />
      </RaisedGraphiteCard>
      <GoldenFeedbackCard visible={showGoldenFeedback} onGood={onGoldenGood} onNotQuite={onGoldenNotQuite} onReason={onGoldenReason} onDismiss={onDismissGoldenFeedback} />
      <View style={[styles.quickControls, styles.quickControlsCompact]}><Pressable style={({ pressed }) => [styles.quickControl, styles.quickControlCompact, pressed && styles.pressed]} onPress={() => setShowVoicePicker(true)} accessibilityLabel="Change voice"><Text style={styles.quickCaption}>VOICE</Text><Text style={styles.quickValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{voice?.name || 'Automatic'}</Text></Pressable><Pressable style={({ pressed }) => [styles.quickControl, styles.quickControlCompact, pressed && styles.pressed]} onPress={() => onUpdateSettings({ rate: speedOptions[(speedOptions.indexOf(item.rate) + 1) % speedOptions.length] })} accessibilityLabel={`Speed ${item.rate} times. Change speed`}><Text style={styles.quickCaption}>SPEED</Text><Text style={styles.quickValue}>{item.rate}×</Text></Pressable><Pressable style={({ pressed }) => [styles.quickControl, styles.quickControlCompact, pressed && styles.pressed]} onPress={() => setShowControls(!showControls)} accessibilityLabel="Advanced controls"><Text style={styles.quickCaption}>MORE</Text><Text style={styles.quickValue}>⌁</Text></Pressable></View>
      <Pressable style={({ pressed }) => [styles.studioEntry, pressed && styles.pressed]} onPress={() => setShowListeningStudio(true)} accessibilityRole="button" accessibilityLabel="Open Listening Studio"><View style={styles.studioEntryIcon}><Text style={styles.studioEntryIconText}>≋</Text></View><View style={styles.grow}><Text style={styles.studioEntryTitle}>Listening Studio</Text><Text style={styles.studioEntryText}>Shape narration, pauses, clarity, and background sound.</Text></View><Text style={styles.summaryEntryChevron}>›</Text></Pressable>
      <View style={styles.playerIdentity}><Text style={styles.nowPlayingLabel}>LISTENING TO</Text><Text style={styles.playerDocumentTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.playerSource}>{voice?.name || 'Automatic voice'} · {item.language}</Text></View>
      <RaisedGraphiteCard variant="recessed" style={styles.currentCard}><Text style={styles.currentKicker}>CURRENT SENTENCE</Text><Text style={styles.currentText}>{currentSentence}</Text></RaisedGraphiteCard>
      <Pressable style={({ pressed }) => [styles.summaryEntry, pressed && styles.pressed]} onPress={onOpenSummary} accessibilityRole="button" accessibilityLabel={hasSummary ? 'Open saved summary' : 'Create a private summary'}><View style={styles.summaryEntryIcon}><Text style={styles.summaryEntryGlyph}>≡</Text></View><View style={styles.grow}><Text style={styles.summaryEntryTitle}>{hasSummary ? 'Saved summary' : 'Summarize this document'}</Text><Text style={styles.summaryEntryText}>{hasSummary ? 'Listen, copy, or regenerate' : 'Private, on-device or extractive'}</Text></View><Text style={styles.summaryEntryChevron}>›</Text></Pressable>
      <Pressable style={({ pressed }) => [styles.summaryEntry, pressed && styles.pressed]} onPress={() => onOpenLearning()} accessibilityRole="button" accessibilityLabel="Open learning tools"><View style={styles.summaryEntryIcon}><Text style={styles.summaryEntryGlyph}>✦</Text></View><View style={styles.grow}><Text style={styles.summaryEntryTitle}>Learning tools</Text><Text style={styles.summaryEntryText}>Ask, explain, review, and compare source text</Text></View><Text style={styles.summaryEntryChevron}>›</Text></Pressable>
      <Pressable style={({ pressed }) => [styles.summaryEntry, pressed && styles.pressed]} onPress={() => onOpenLearning('podcast')} accessibilityRole="button" accessibilityLabel="Create a podcast recap"><View style={styles.summaryEntryIcon}><Text style={styles.summaryEntryGlyph}>◌</Text></View><View style={styles.grow}><Text style={styles.summaryEntryTitle}>Podcast recap</Text><Text style={styles.summaryEntryText}>Turn the key ideas into a grounded two-voice recap</Text></View><Text style={styles.summaryEntryChevron}>›</Text></Pressable>
      <Pressable style={({ pressed }) => [styles.summaryEntry, pressed && styles.pressed]} onPress={() => onOpenLearning('review')} accessibilityRole="button" accessibilityLabel="Create a knowledge quiz"><View style={styles.summaryEntryIcon}><Text style={styles.summaryEntryGlyph}>?</Text></View><View style={styles.grow}><Text style={styles.summaryEntryTitle}>Knowledge quiz</Text><Text style={styles.summaryEntryText}>Review with questions built from this document</Text></View><Text style={styles.summaryEntryChevron}>›</Text></Pressable>
      <View style={styles.readerTools}><Pressable style={styles.readerTool} onPress={onBookmark}><Text style={styles.readerToolIcon}>☆</Text><Text style={styles.readerToolText}>Bookmark sentence</Text></Pressable><Pressable style={styles.readerTool} onPress={onOpenBookmarks}><Text style={styles.readerToolIcon}>⌑</Text><Text style={styles.readerToolText}>Bookmarks & sections</Text></Pressable></View>
      <Pressable style={({ pressed }) => [styles.readerPreviewToggle, pressed && styles.pressed]} onPress={() => setShowReadAlong(!showReadAlong)} accessibilityRole="button" accessibilityLabel={showReadAlong ? 'Hide read along text' : 'Show read along text'}><View style={styles.grow}><Text style={styles.readerPreviewKicker}>READ ALONG</Text><Text style={styles.readerPreviewTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{player.chapterTitle || activeSection?.title || 'Current passage'}</Text><Text style={styles.readerPreviewMeta}>{showReadAlong ? 'Tap a sentence to start there' : 'Open the section being read'}</Text></View><Text style={styles.readerPreviewChevron}>{showReadAlong ? '⌃' : '›'}</Text></Pressable>
      {showReadAlong && <View style={styles.passagePreview}>{player.sentences.slice(sectionStart, sectionEnd).map((sentence, offset) => { const sentenceIndex = sectionStart + offset; const current = sentenceIndex === item.sentenceIndex; return <Pressable key={`${sentenceIndex}-${sentence.slice(0, 8)}`} onPress={() => player.jump(sentenceIndex - item.sentenceIndex)} onLongPress={() => onHighlight(sentenceIndex)} style={[styles.passageLine, current && styles.passageLineCurrent]} accessibilityRole="button" accessibilityLabel={current ? `Current sentence: ${sentence}` : `Play from: ${sentence}`}><Text style={[styles.passageLineText, current && styles.passageLineTextCurrent]}>{sentence}</Text></Pressable>; })}</View>}
    </ScrollView>
    <View style={styles.playerControlDock}><View style={styles.scrubberSection}><View style={styles.scrubberHeader}><Text style={styles.scrubberLabel}>NOW READING</Text><Text style={styles.scrubberCurrentText} numberOfLines={1}>“{currentSentence}”</Text></View><SegmentedControlDial value={item.progress * 100} onChange={(percentage) => player.seekToNormalizedPosition(percentage / 100)} compact timelineOnly markers={navigationMarkers} jumpTargets={navigationTargets} context={navigationContext} totalDurationSeconds={navigationDurationSeconds} reduceMotion={reduceMotion} /></View><View style={[styles.mainControls, styles.mainControlsCompact]}><PlayerTransportButton icon="‹‹" label="Previous sentence" onPress={() => player.jump(-1)} reduceMotion={reduceMotion} /><PlayerTransportButton icon={player.state === 'playing' ? 'Ⅱ' : '▶'} label={player.state === 'playing' ? 'Pause' : 'Play'} onPress={() => player.state === 'playing' ? player.pause() : player.play()} primary active={player.state === 'playing'} reduceMotion={reduceMotion} /><PlayerTransportButton icon="››" label="Next sentence" onPress={() => player.jump(1)} reduceMotion={reduceMotion} /></View></View>
    {showControls && <View style={styles.advanced}><View style={styles.advancedTop}><Text style={styles.advancedTitle}>Advanced controls</Text><Pressable onPress={() => setShowControls(false)}><Text style={styles.closeText}>Done</Text></Pressable></View><Text style={styles.controlLabel}>Pitch</Text><View style={styles.optionRow}>{pitchOptions.map(({ label, value }) => <Pressable key={label} onPress={() => onUpdateSettings({ pitch: value })} style={[styles.option, item.pitch === value && styles.optionSelected]}><Text style={[styles.optionText, item.pitch === value && styles.optionTextSelected]}>{label}</Text></Pressable>)}</View><Text style={styles.controlLabel}>Speed</Text><View style={styles.optionRow}>{speedOptions.map((value) => <Pressable key={value} onPress={() => onUpdateSettings({ rate: value })} style={[styles.speedOption, item.rate === value && styles.optionSelected]}><Text style={[styles.optionText, item.rate === value && styles.optionTextSelected]}>{value}×</Text></Pressable>)}</View><Pressable style={styles.adaptiveRow} onPress={() => onUpdateSettings({ adaptiveListeningEnabled: !preferences.adaptiveListeningEnabled })}><View style={styles.grow}><Text style={styles.controlLabel}>Adaptive listening</Text><Text style={styles.adaptiveReason}>{preferences.adaptiveListeningEnabled ? 'On · adjusts at sentence boundaries' : 'Off · keeps your selected pace'}</Text></View><Text style={styles.adaptiveToggle}>{preferences.adaptiveListeningEnabled ? 'ON' : 'OFF'}</Text></Pressable></View>}
    <ListeningStudioModal visible={showListeningStudio} preferences={preferences} voices={player.voices} selectedVoice={item.selectedVoice} playing={player.state === 'playing'} reduceMotion={reduceMotion} onClose={() => setShowListeningStudio(false)} onUpdateSettings={onUpdateSettings} onOpenVoicePicker={() => setShowVoicePicker(true)} />
    <VoicePickerModal visible={showVoicePicker} voices={player.voices} selectedVoice={item.selectedVoice} onSelect={onUpdateSettings} onPreview={(voice) => player.preview({ voiceIdentifier: voice.identifier, rate: item.rate, pitch: item.pitch, volume: preferences.volume })} onClose={() => setShowVoicePicker(false)} />
  </View>;
}

function PlayerTransportButton({ icon, label, onPress, primary = false, active = false, reduceMotion }: { icon: string; label: string; onPress: () => void; primary?: boolean; active?: boolean; reduceMotion: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateScale = useCallback((toValue: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue, speed: 28, bounciness: 0, useNativeDriver: true }).start();
  }, [reduceMotion, scale]);
  const size = primary ? 56 : 44;
  return <Pressable onPress={onPress} onPressIn={() => animateScale(primary ? 0.97 : 0.98)} onPressOut={() => animateScale(1)} style={[styles.playerTransportHit, { width: size, height: size }]} accessibilityRole="button" accessibilityLabel={label}>{({ pressed }) => <Animated.View style={[styles.playerTransportSurface, primary ? [styles.playerPlayButton, styles.playerPlayButtonCompact, active && styles.playerPlayActive] : styles.playerSkipButton, pressed && (primary ? styles.playerPlayPressed : styles.playerSkipPressed), { transform: [{ scale }] }]}>{primary ? <Text style={styles.playIcon}>{icon}</Text> : <View pointerEvents="none" style={styles.playerSkipInner}><Text style={styles.playerSkipIcon}>{icon}</Text></View>}</Animated.View>}</Pressable>;
}

function FreeListeningPlayerPill({ remainingLabel, resetLabel, critical, onPress, reduceMotion }: { remainingLabel: string; resetLabel: string; critical: boolean; onPress: () => void; reduceMotion: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateScale = useCallback((toValue: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue, speed: 30, bounciness: 0, useNativeDriver: true }).start();
  }, [reduceMotion, scale]);
  return <Pressable onPress={onPress} onPressIn={() => animateScale(0.98)} onPressOut={() => animateScale(1)} hitSlop={10} style={styles.freePlayerHeaderPillHit} accessibilityRole="button" accessibilityLabel={`${remainingLabel} free listening this week. ${resetLabel}.`} accessibilityHint="Opens unlimited listening plans">{({ pressed }) => <Animated.View style={[styles.freePlayerHeaderPill, critical && styles.freePlayerHeaderPillCritical, pressed && styles.freePlayerHeaderPillPressed, { transform: [{ scale }] }]}><View pointerEvents="none" style={styles.freePlayerHeaderPillHighlight} /><Text style={styles.freePlayerHeaderLabel}>FREE</Text><View pointerEvents="none" style={styles.freePlayerHeaderSeparator} /><Text style={styles.freePlayerHeaderTime}>{remainingLabel}</Text><Text style={styles.freePlayerHeaderChevron}>›</Text></Animated.View>}</Pressable>;
}

function ProfessionalPlayerScreen({ player, onUpdateSettings, onClose, showControls, setShowControls, showVoicePicker, setShowVoicePicker }: { player: ReturnType<typeof useSpeechPlayer>; onUpdateSettings: (settings: Partial<ListeningSettings>) => void; onClose: () => void; showControls: boolean; setShowControls: (value: boolean) => void; showVoicePicker: boolean; setShowVoicePicker: (value: boolean) => void }) {
  const item = player.item;
  if (!item) return <View style={styles.playerScreen}><Pressable onPress={onClose}><Text style={styles.back}>‹ Home</Text></Pressable><Text style={styles.emptyTitle}>Nothing loaded yet.</Text></View>;
  const index = item.sentenceIndex;
  const currentSentences = player.sentences.slice(Math.max(0, index - 2), index + 4);
  const voice = player.voices.find((candidate) => candidate.identifier === item.selectedVoice);
  return <View style={styles.playerScreen}><View style={styles.playerHeader}><Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close player"><Text style={styles.back}>⌄</Text></Pressable><View style={styles.playerHeadText}><Text style={styles.playerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.title}</Text><Text style={styles.playerSource} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.source || typeLabel(item.type)}</Text></View><Pressable onPress={() => setShowControls(!showControls)} hitSlop={12} accessibilityLabel="Player options"><Text style={styles.more}>•••</Text></Pressable></View>
    <View style={styles.nowPlaying}><Text style={styles.nowPlayingLabel}>NOW LISTENING</Text><Text style={styles.chapterTitle}>From the beginning</Text></View>
    <ScrollView style={styles.passageScroll} contentContainerStyle={styles.passageContent} showsVerticalScrollIndicator={false}>{currentSentences.map((sentence, offset) => { const sentenceIndex = Math.max(0, index - 2) + offset; const current = sentenceIndex === index; return <Pressable key={`${sentenceIndex}-${sentence.slice(0, 8)}`} onPress={() => player.jump(sentenceIndex - index)} style={[styles.sentence, current && styles.currentSentence]} accessibilityRole="button" accessibilityLabel={current ? `Current sentence: ${sentence}` : `Play from: ${sentence}`}><Text style={[styles.sentenceText, current && styles.currentSentenceText]}>{sentence}</Text></Pressable>; })}</ScrollView>
    <View style={styles.progressArea}><View style={styles.progressLabels}><Text style={styles.progressMeta}>{Math.round(item.progress * 100)}% complete</Text><Text style={styles.progressMeta}>{formatDuration(estimateSeconds(item.wordCount * (1 - item.progress), item.rate)).replace('About ', '')} left</Text></View><Progress value={item.progress} /></View>
    <View style={styles.mainControls}><Pressable style={styles.skipButton} onPress={() => player.jump(-1)} accessibilityLabel="Previous sentence"><Text style={styles.skipIcon}>‹‹</Text></Pressable><Pressable style={styles.playButton} onPress={() => player.state === 'playing' ? player.pause() : player.play()} accessibilityRole="button" accessibilityLabel={player.state === 'playing' ? 'Pause' : 'Play'}><Text style={styles.playIcon}>{player.state === 'playing' ? 'Ⅱ' : '▶'}</Text></Pressable><Pressable style={styles.skipButton} onPress={() => player.jump(1)} accessibilityLabel="Next sentence"><Text style={styles.skipIcon}>››</Text></Pressable></View>
    <View style={styles.quickControls}><Pressable style={styles.quickControl} onPress={() => setShowVoicePicker(true)} accessibilityLabel="Change voice"><Text style={styles.quickCaption}>VOICE</Text><Text style={styles.quickValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{voice?.name || 'Automatic'}</Text></Pressable><Pressable style={styles.quickControl} onPress={() => onUpdateSettings({ rate: speedOptions[(speedOptions.indexOf(item.rate) + 1) % speedOptions.length] })} accessibilityLabel={`Speed ${item.rate} times. Change speed`}><Text style={styles.quickCaption}>SPEED</Text><Text style={styles.quickValue}>{item.rate}×</Text></Pressable><Pressable style={styles.quickControl} onPress={() => setShowControls(!showControls)} accessibilityLabel="Advanced controls"><Text style={styles.quickCaption}>MORE</Text><Text style={styles.quickValue}>⌁</Text></Pressable></View>
    {showControls && <View style={styles.advanced}><View style={styles.advancedTop}><Text style={styles.advancedTitle}>Advanced controls</Text><Pressable onPress={() => setShowControls(false)}><Text style={styles.closeText}>Done</Text></Pressable></View><Text style={styles.controlLabel}>Pitch</Text><View style={styles.optionRow}>{([{ label: 'Low', value: 0.8 }, { label: 'Natural', value: 1 }, { label: 'High', value: 1.2 }] as const).map(({ label, value }) => <Pressable key={label} onPress={() => onUpdateSettings({ pitch: value })} style={[styles.option, item.pitch === value && styles.optionSelected]}><Text style={[styles.optionText, item.pitch === value && styles.optionTextSelected]}>{label}</Text></Pressable>)}</View><Text style={styles.controlLabel}>Speed</Text><View style={styles.optionRow}>{speedOptions.map((value) => <Pressable key={value} onPress={() => onUpdateSettings({ rate: value })} style={[styles.speedOption, item.rate === value && styles.optionSelected]}><Text style={[styles.optionText, item.rate === value && styles.optionTextSelected]}>{value}×</Text></Pressable>)}</View></View>}
    <VoicePickerModal visible={showVoicePicker} voices={player.voices} selectedVoice={item.selectedVoice} onSelect={onUpdateSettings} onPreview={(voice) => player.preview({ voiceIdentifier: voice.identifier, rate: item.rate, pitch: item.pitch, volume: 1 })} onClose={() => setShowVoicePicker(false)} />
  </View>;
}

function VoicePickerModal({ visible, voices, selectedVoice, onSelect, onPreview, onClose }: { visible: boolean; voices: Voice[]; selectedVoice?: string; onSelect: (settings: Partial<ListeningSettings>) => void; onPreview: (voice: Voice) => void; onClose: () => void }) { return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.voiceModal}><View style={styles.voiceHeader}><View><Text style={styles.screenTitle}>Choose a voice</Text><Text style={styles.voiceIntro}>Every voice and accent comes from your iPhone.</Text></View><Pressable onPress={onClose}><Text style={styles.closeText}>Done</Text></Pressable></View><VoicePicker voices={voices} selectedVoice={selectedVoice} onPreview={onPreview} onSelect={(identifier) => { const voice = voices.find((candidate) => candidate.identifier === identifier); onSelect({ voiceIdentifier: identifier, voiceName: voice?.name, voiceLocale: voice?.language }); onClose(); }} /></SafeAreaView></Modal>; }

function MiniPlayer({ item, state, onPress, onToggle, onStopListening }: { item: LibraryItem; state: string; onPress: () => void; onToggle: () => void; onStopListening: () => void }) {
  const dismissGesture = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => state === 'paused' && gesture.dy > 24 && gesture.dy > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => { if (gesture.dy > 72 && gesture.dy > Math.abs(gesture.dx) * 1.5) onStopListening(); },
  }), [onStopListening, state]);
  return <View style={[styles.miniPlayer, { bottom: 104 }]}><Pressable {...dismissGesture.panHandlers} onPress={onPress} style={styles.miniOpen} accessibilityLabel={`Open player for ${item.title}`} accessibilityHint={state === 'paused' ? 'Swipe down to stop listening and dismiss the compact player' : undefined}><SourceMark item={item} /><View style={styles.grow}><Text style={styles.miniTitle} numberOfLines={2} ellipsizeMode="tail">{state === 'paused' && <Text style={styles.miniPausedLabel}>PAUSED · </Text>}{item.title}</Text><Progress value={item.progress} compact /></View></Pressable><Pressable onPress={onToggle} style={styles.miniToggle} accessibilityLabel={state === 'playing' ? 'Pause' : 'Play'}><Text style={styles.miniToggleIcon}>{state === 'playing' ? 'Ⅱ' : '▶'}</Text></Pressable></View>;
}
function TabBar({ screen, onChange, miniPlayer }: { screen: Screen; onChange: (screen: Screen) => void; miniPlayer: boolean }) {
  const tabs = [{ id: 'home', icon: '⌂', label: 'Home' }, { id: 'library', icon: '▤', label: 'Library' }, { id: 'player', icon: '◉', label: 'Player' }, { id: 'settings', icon: '⚙', label: 'Settings' }];
  return <PremiumBottomTabBar selected={screen} onChange={(id) => onChange(id as Screen)} tabs={tabs} hasMiniPlayer={miniPlayer} />;
}

function ImportCapacityHint({ children }: { children: string }) { return <View style={styles.importCapacityHint}><Text style={styles.importCapacityIcon}>◷</Text><Text style={styles.importCapacityText}>{children}</Text></View>; }

function ImportModal({ mode, text, link, title, busy, onText, onLink, onTitle, onClose, onPaste, onSubmit }: { mode: ImportMode; text: string; link: string; title: string; busy: boolean; onText: (text: string) => void; onLink: (value: string) => void; onTitle: (value: string) => void; onClose: () => void; onPaste: () => void; onSubmit: () => void }) {
  const [metrics, setMetrics] = useState({ words: 0, pages: undefined as number | undefined });
  useEffect(() => {
    if (mode !== 'text') { setMetrics({ words: 0, pages: undefined }); return; }
    const timer = setTimeout(() => {
      const words = countWords(text);
      setMetrics({ words, pages: estimateDocumentPages(words) });
    }, 180);
    return () => clearTimeout(timer);
  }, [mode, text]);
  const pageLabel = formatDocumentPages(metrics.pages, false);
  return <Modal visible={mode !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.importModal}><View style={styles.modalHeader}><View><Text style={styles.screenTitle}>{mode === 'text' ? 'Paste Text' : 'Web Article or Link'}</Text><Text style={styles.screenSubtitle}>{mode === 'text' ? 'Long manuscripts welcome. Soundoc prepares them in sections when needed.' : 'Paste an article or a direct document link.'}</Text></View><Pressable onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable></View>{mode === 'text' ? <><View style={styles.titleInputWrap}><Text style={styles.inputLabel}>TITLE (OPTIONAL)</Text><TextInput value={title} onChangeText={onTitle} placeholder="Add a title" placeholderTextColor={colors.textTertiary} style={styles.titleInput} /></View><TextInput value={text} onChangeText={(value) => { onText(value); if (!title) onTitle(suggestedTitle(value)); }} multiline autoFocus placeholder="Paste or write something here…" placeholderTextColor={colors.textTertiary} style={styles.textEditor} textAlignVertical="top" accessibilityLabel="Text to listen to" /><View style={styles.editorFooter}><Pressable onPress={onPaste} style={styles.clipboard}><Text style={styles.clipboardText}>Paste from clipboard</Text></Pressable><Text style={styles.wordMeta}>{metrics.words ? `${metrics.words.toLocaleString()} words${pageLabel ? ` · ${pageLabel}` : ''} · ${formatDuration(estimateSeconds(metrics.words)).replace('About ', '')}` : 'Ready when you are'}</Text></View><ImportCapacityHint>Long manuscripts are saved in durable sections so you can resume where you left off.</ImportCapacityHint></> : <><TextInput value={link} onChangeText={onLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" autoFocus placeholder="https://example.com/article-or-document" placeholderTextColor={colors.textTertiary} style={styles.linkInput} accessibilityLabel="Article or document link" /><View style={styles.linkHelp}><Text style={styles.linkHelpTitle}>A quick privacy note</Text><Text style={styles.linkHelpText}>Soundoc requests this public link directly from its original site. Article pages are cleaned for listening; direct PDF, EPUB, DOCX, and text links are imported as documents.</Text></View><ImportCapacityHint>Articles & direct document links are handled separately. Sign-ins and paywalls may need pasted text.</ImportCapacityHint></>}<Pressable onPress={onSubmit} disabled={busy} style={[styles.modalPrimary, busy && styles.disabled]}><Text style={styles.modalPrimaryText}>{busy ? 'Preparing…' : 'Prepare to listen'}</Text><Text style={styles.modalPrimaryArrow}>›</Text></Pressable></SafeAreaView></Modal>;
}

function OcrPreviewModal({ draft, onClose, onSave, onChange }: { draft: OcrDraft; onClose: () => void; onSave: () => void; onChange: (next: Partial<NonNullable<OcrDraft>>) => void }) {
  if (!draft) return null;
  const words = countWords(draft.text);
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.articlePreviewModal}><View style={styles.modalHeader}><View><Text style={styles.screenTitle}>Review scanned text</Text><Text style={styles.screenSubtitle}>OCR stays on this device. Correct anything before saving.</Text></View><Pressable onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable></View><TextInput value={draft.title} onChangeText={(title) => onChange({ title })} style={styles.titleInput} placeholder="Title" placeholderTextColor={colors.textTertiary} /><Text style={styles.articlePreviewMeta}>{words.toLocaleString()} words · {words < 15 ? 'Low confidence — please review' : 'Text detected'}</Text><TextInput value={draft.text} onChangeText={(text) => onChange({ text })} multiline textAlignVertical="top" style={styles.ocrEditor} placeholder="No readable text found" placeholderTextColor={colors.textTertiary} /><Pressable style={styles.modalPrimary} onPress={onSave}><Text style={styles.modalPrimaryText}>Save to library</Text><Text style={styles.modalPrimaryArrow}>›</Text></Pressable></SafeAreaView></Modal>;
}

function ArticlePreviewModal({ extraction, onClose, onEdit, onContinue }: { extraction: ArticleExtraction | null; onClose: () => void; onEdit: (extraction: ArticleExtraction) => void; onContinue: (extraction: ArticleExtraction) => void }) {
  if (!extraction) return null;
  const wordCount = countWords(extraction.text);
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.articlePreviewModal}><View style={styles.modalHeader}><View style={{ flex: 1, minWidth: 0, marginRight: space.sm }}><Text style={styles.screenTitle} numberOfLines={1} ellipsizeMode="tail">Article preview</Text><Text style={styles.screenSubtitle}>Review the readable content before Soundoc saves it.</Text></View><Pressable onPress={onClose} style={{ minWidth: 52, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Cancel article preview"><Text style={styles.closeText}>Cancel</Text></Pressable></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.articlePreviewScroll}><View style={styles.articlePreviewSource}><Text style={styles.articlePreviewKicker}>SOURCE DOMAIN</Text><Text style={styles.articlePreviewDomain}>{extraction.sourceDomain}</Text><Text style={styles.articlePreviewMeta}>{wordCount.toLocaleString()} words · {Math.round(extraction.confidence * 100)}% confidence · {extraction.method === 'json-ld' ? 'Structured article data' : extraction.method === 'semantic' ? 'Article content container' : 'Readability-style extraction'}</Text></View><Text style={styles.articlePreviewTitle}>{extraction.title || 'Untitled article'}</Text>{extraction.authors.length > 0 && <Text style={styles.articlePreviewAuthors}>By {extraction.authors.join(', ')}</Text>}{extraction.suspicious && <View style={styles.articlePreviewWarning}><Text style={styles.articlePreviewWarningIcon}>!</Text><View style={styles.grow}><Text style={styles.articlePreviewWarningTitle}>Check this extraction</Text><Text style={styles.articlePreviewWarningText}>{extraction.warnings[0] || 'Some page content may still be mixed in.'} You can edit the text before saving.</Text></View></View>}{extraction.sections && extraction.sections.length > 0 && <View style={styles.articlePreviewSections}><Text style={styles.articlePreviewTextLabel}>SECTIONS DETECTED</Text>{extraction.sections.slice(0, 8).map((section) => <Text key={section.id} style={styles.articlePreviewSection}>{section.title || 'Body text'}</Text>)}</View>}<View style={styles.articlePreviewTextCard}><Text style={styles.articlePreviewTextLabel}>READABLE TEXT PREVIEW</Text><Text style={styles.articlePreviewText}>{extraction.text.slice(0, 1200)}{extraction.text.length > 1200 ? '…' : ''}</Text></View><Text style={styles.articlePreviewStored}>Original URL saved with this article: {extraction.sourceUrl}</Text></ScrollView><View style={styles.articlePreviewActions}><Pressable onPress={() => onEdit(extraction)} style={styles.articlePreviewEdit}><Text style={styles.articlePreviewEditText}>Edit text</Text></Pressable><Pressable onPress={() => onContinue(extraction)} style={styles.articlePreviewContinue}><Text style={styles.articlePreviewContinueText}>Prepare to listen</Text><Text style={styles.articlePreviewArrow}>›</Text></Pressable></View></SafeAreaView></Modal>;
}

function PreparedModal({ prepared, onClose, onPlay, onRetry, onPlayNext, onAddToQueue }: { prepared: Prepared; onClose: () => void; onPlay: () => void; onRetry: () => void; onPlayNext: () => void; onAddToQueue: () => void }) {
  if (!prepared) return null;
  const { item } = prepared;
  const chunked = item.storageMode === 'chunked';
  const errorState = item.processingStatus === 'failed' || item.processingStatus === 'needsOCR';
  const preparing = chunked && !errorState && item.processingStatus !== 'ready';
  const canPlay = !errorState && (!chunked || (item.processedUnits ?? 0) > 0 || item.processingStatus === 'ready');
  const confidence = typeof item.extractionConfidence === 'number' ? `${Math.round(item.extractionConfidence * 100)}% extraction confidence` : undefined;
  const metadata = [formatDocumentPages(item.pageCount, hasExactPageCount(item.sourceType)), item.wordCount ? `${item.wordCount.toLocaleString()} words` : undefined, item.estimatedDurationSeconds ? `${displayDuration(item.estimatedDurationSeconds)} listening` : undefined, confidence].filter(Boolean) as string[];
  const title = errorState ? item.processingStatus === 'needsOCR' ? 'Scanned PDF detected' : 'This file couldn’t be prepared' : preparing ? 'Preparing your document' : 'READY TO LISTEN';
  const detail = item.processingError || prepared.message;
  return <Modal visible animationType="fade" transparent onRequestClose={onClose}><View style={styles.preparedBackdrop}><View style={styles.preparedCard}><View style={[styles.successMark, errorState && styles.preparedErrorMark, preparing && styles.preparedPreparingMark]}><Text style={styles.successIcon}>{errorState ? '!' : preparing ? '◷' : '✓'}</Text></View><Text style={[styles.preparedKicker, errorState && styles.preparedErrorKicker]}>{title}</Text><Text style={styles.preparedTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.preparedMessage}>{detail}</Text>{metadata.length > 0 && <View style={styles.preparedMeta}>{metadata.map((value, index) => <Text key={value}>{index > 0 ? `· ${value}` : value}</Text>)}</View>}{preparing && <><View style={styles.preparedProgressMeta}><Text style={styles.preparedProgressLabel}>{item.processedUnits?.toLocaleString() ?? 0} sections ready{item.processingProgress ? ` · ${Math.round(item.processingProgress * 100)}%` : ''}</Text><Text style={styles.preparedProgressHint}>You can start listening as soon as the first section is ready.</Text></View><Progress value={item.processingProgress ?? 0} compact /></>}{errorState && item.processingStatus === 'needsOCR' && <Text style={styles.preparedWarning}>{SCANNED_PDF_COPY}</Text>}{item.extractionWarnings?.[0] && !errorState && <Text style={styles.preparedWarning}>{item.extractionWarnings[0]}</Text>}{!errorState && item.estimatedDurationSeconds ? <EstimateBadge seconds={remainingListeningSeconds(item)} /> : null}<Pressable style={[styles.playNow, !canPlay && styles.playNowDisabled]} onPress={onPlay} disabled={!canPlay}><Text style={styles.playNowIcon}>▶</Text><Text style={styles.playNowText}>{canPlay ? (preparing ? 'Start Listening' : 'Play') : 'Preparing first section…'}</Text></Pressable>{errorState && item.processingStatus === 'failed' && <Pressable style={styles.preparedRetry} onPress={onRetry}><Text style={styles.preparedRetryText}>Retry preparation</Text></Pressable>}{!errorState && <View style={styles.preparedActions}><Pressable style={styles.secondaryModalAction} onPress={onPlayNext}><Text style={styles.secondaryModalLabel}>Play next</Text></Pressable><Pressable style={styles.secondaryModalAction} onPress={onAddToQueue}><Text style={styles.secondaryModalLabel}>Add to queue</Text></Pressable></View>}</View></View></Modal>;
}

function SummaryModal({ visible, item, summary, busy, progress, privacyDescription, onClose, onGenerate, onCancel, onListen, onDelete }: { visible: boolean; item: LibraryItem | null; summary: SummaryResult | null; busy: boolean; progress: string; privacyDescription: string; onClose: () => void; onGenerate: (length: SummaryLength, format: SummaryFormat) => void; onCancel: () => void; onListen: (text: string) => void; onDelete: () => void }) {
  const [length, setLength] = useState<SummaryLength>('standard'); const [format, setFormat] = useState<SummaryFormat>('overview');
  if (!item) return null;
  const summaryText = summary ? [summary.overview, ...summary.keyPoints].filter(Boolean).join('\n\n') : '';
  const copy = () => { if (summaryText) void Clipboard.setStringAsync(summaryText); };
  const share = () => { if (summaryText) void Share.share({ title: `${item.title} summary`, message: summaryText }); };
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.summaryModal}><View style={[styles.modalHeader, styles.summaryModalHeader]}><View><Text style={styles.screenTitle}>Summary</Text><Text style={styles.screenSubtitle}>A private reading companion for this document.</Text></View><Pressable onPress={onClose}><Text style={styles.closeText}>Done</Text></Pressable></View><ScrollView contentContainerStyle={styles.summaryScroll} showsVerticalScrollIndicator={false}><View style={styles.summaryPrivacy}><Text style={styles.summaryPrivacyIcon}>⌁</Text><Text style={styles.summaryPrivacyText}>{privacyDescription}</Text></View><Text style={styles.summaryDocumentTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.summarySourceMeta}>{item.wordCount.toLocaleString()} source words · {summary ? `${getProviderName(summary.provider)} · ${summary.sourceWordCount.toLocaleString()} words used` : 'Nothing generated yet'}</Text><Text style={styles.summaryLabel}>LENGTH</Text><View style={styles.summaryOptions}>{(['brief', 'standard', 'detailed'] as SummaryLength[]).map((option) => <Pressable key={option} onPress={() => setLength(option)} style={[styles.summaryOption, length === option && styles.summaryOptionSelected]}><Text style={[styles.summaryOptionText, length === option && styles.summaryOptionTextSelected]}>{option[0].toUpperCase() + option.slice(1)}</Text></Pressable>)}</View><Text style={styles.summaryLabel}>FORMAT</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryOptions}>{(['overview', 'key-points', 'section-summary', 'study-notes', 'research-summary'] as SummaryFormat[]).map((option) => <Pressable key={option} onPress={() => setFormat(option)} style={[styles.summaryFormatOption, format === option && styles.summaryOptionSelected]}><Text style={[styles.summaryOptionText, format === option && styles.summaryOptionTextSelected]}>{option.replace('-', ' ')}</Text></Pressable>)}</ScrollView>{busy ? <View style={styles.summaryBusy}><ActivityIndicator color={colors.accentPrimary} /><Text style={styles.summaryBusyText}>{progress || 'Preparing summary'}</Text><Pressable onPress={onCancel} style={styles.summaryCancel}><Text style={styles.summaryCancelText}>Cancel</Text></Pressable></View> : <Pressable onPress={() => onGenerate(length, format)} style={styles.summaryGenerate}><Text style={styles.summaryGenerateText}>{summary ? 'Regenerate summary' : 'Generate summary'}</Text><Text style={styles.summaryGenerateArrow}>›</Text></Pressable>}{summary && !busy && <><View style={styles.summaryResultHeader}><View><Text style={styles.summaryResultTitle}>{summary.title || 'Summary'}</Text><Text style={styles.summaryResultMeta}>{summary.isGenerative ? 'Generative on-device summary' : 'Extractive summary — selected from the original text.'} · {new Date(summary.generatedAt).toLocaleDateString()}</Text></View><Pressable onPress={onDelete}><Text style={styles.summaryDelete}>Delete</Text></Pressable></View><View style={styles.summaryOverview}><Text style={styles.summaryLabel}>OVERVIEW</Text><Text style={styles.summaryBody}>{summary.overview}</Text></View><Text style={styles.summaryLabel}>KEY POINTS</Text><View style={styles.summaryPoints}>{summary.keyPoints.map((point, index) => <Text key={`${index}-${point.slice(0, 10)}`} style={styles.summaryPoint}>• {point}</Text>)}</View>{summary.importantTerms?.length ? <><Text style={styles.summaryLabel}>IMPORTANT TERMS</Text>{summary.importantTerms.map((term) => <Text key={term.term} style={styles.summaryTerm}><Text style={styles.summaryTermName}>{term.term}: </Text>{term.explanation}</Text>)}</> : null}{summary.sectionSummaries?.length ? <><Text style={styles.summaryLabel}>SECTION SUMMARIES</Text>{summary.sectionSummaries.map((section) => <View key={`${section.sectionId}-${section.heading}`} style={styles.summarySection}><Text style={styles.summarySectionHeading}>{section.heading}</Text><Text style={styles.summaryBody}>{section.summary}</Text></View>)}</> : null}<View style={styles.summaryLimitations}><Text style={styles.summaryLabel}>ABOUT THIS SUMMARY</Text>{summary.limitations.map((limitation) => <Text key={limitation} style={styles.summaryLimitation}>{limitation}</Text>)}</View><View style={styles.summaryActions}><Pressable onPress={() => onListen(summaryText)} style={styles.summaryAction}><Text style={styles.summaryActionText}>▶ Listen</Text></Pressable><Pressable onPress={copy} style={styles.summaryAction}><Text style={styles.summaryActionText}>Copy</Text></Pressable><Pressable onPress={share} style={styles.summaryAction}><Text style={styles.summaryActionText}>Share</Text></Pressable></View></>}</ScrollView></SafeAreaView></Modal>;
}

function LearningToolsModal({ visible, initialTab, item, question, passages, answer, explanation, cards, review, podcast, academic, spokenPreview, busy, onClose, onAsk, onExplain, onCreateCards, onCreatePodcast, onListen, onListenConversation }: { visible: boolean; initialTab: LearningToolTab; item: LibraryItem | null; question: string; passages: SourcePassage[]; answer: GroundedAnswer | null; explanation: PassageExplanation | null; cards: Flashcard[]; review: ReviewQuestion[]; podcast: PodcastScript | null; academic: Array<SoundocSection & { academicType?: string }>; spokenPreview: ReturnType<typeof compareOriginalAndSpoken> | null; busy: boolean; onClose: () => void; onAsk: (question: string) => void; onExplain: () => void; onCreateCards: () => void; onCreatePodcast: () => void; onListen: (text: string) => void; onListenConversation: (turns: Array<{ speaker: string; text: string }>) => void }) {
  const [tab, setTab] = useState<LearningToolTab>(initialTab); const [draft, setDraft] = useState('');
  useEffect(() => { if (visible) setTab(initialTab); }, [initialTab, visible]);
  const adaptive = item ? adaptiveChange(item.text.slice(Math.max(0, item.currentCharacterOffset ?? 0), (item.currentCharacterOffset ?? 0) + 400), { rate: item.rate, sentencePauseMs: 300, paragraphPauseMs: 650 }) : null;
  const podcastText = podcast?.turns.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n\n') ?? '';
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.summaryModal}><View style={styles.modalHeader}><View><Text style={styles.screenTitle}>Learning tools</Text><Text style={styles.screenSubtitle}>{item?.title || 'Choose a document first'}</Text></View><Pressable onPress={onClose}><Text style={styles.closeText}>Done</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.learningTabs}>{(['ask', 'explain', 'review', 'academic', 'compare', 'podcast'] as const).map((value) => <Pressable key={value} onPress={() => setTab(value)} style={[styles.learningTab, tab === value && styles.learningTabSelected]}><Text style={[styles.learningTabText, tab === value && styles.learningTabTextSelected]}>{value === 'ask' ? 'Ask' : value === 'explain' ? 'Explain' : value === 'review' ? 'Review' : value === 'academic' ? 'Academic' : value === 'compare' ? 'Source' : 'Podcast'}</Text></Pressable>)}</ScrollView><ScrollView contentContainerStyle={styles.summaryScroll} showsVerticalScrollIndicator={false}>{tab === 'ask' && <><Text style={styles.summaryLabel}>ASK THIS DOCUMENT</Text><Text style={styles.learningHint}>Answers are grounded only in matching passages. Soundoc will say when the document does not contain the answer.</Text><TextInput value={draft} onChangeText={setDraft} placeholder="What does this document say about…?" placeholderTextColor={colors.textTertiary} style={styles.textInput} /><Pressable style={styles.summaryGenerate} disabled={busy} onPress={() => onAsk(draft)}><Text style={styles.summaryGenerateText}>{busy ? 'Searching passages…' : 'Ask document'}</Text><Text style={styles.summaryGenerateArrow}>›</Text></Pressable>{answer && <View style={styles.learningResult}><Text style={styles.summaryLabel}>{answer.isGenerative ? 'GENERATED ANSWER' : 'SOURCE-ONLY ANSWER'}</Text><Text style={styles.summaryBody}>{answer.answer}</Text>{answer.passages.map((passage) => <Pressable key={`${passage.sectionId}-${passage.startOffset}`} style={styles.learningExcerpt}><Text style={styles.learningExcerptTitle}>{passage.sectionTitle}</Text><Text style={styles.learningExcerptText}>{passage.text}</Text></Pressable>)}{answer.limitations.map((limitation) => <Text key={limitation} style={styles.summaryLimitation}>{limitation}</Text>)}</View>}{passages.length === 0 && question ? <Text style={styles.emptyText}>No matching passages yet.</Text> : null}</>}{tab === 'explain' && <><Text style={styles.summaryLabel}>EXPLAIN CURRENT PASSAGE</Text><Text style={styles.learningHint}>Uses the currently highlighted sentence and preserves its source meaning.</Text><Pressable style={styles.summaryGenerate} onPress={onExplain}><Text style={styles.summaryGenerateText}>{busy ? 'Explaining…' : 'Explain this passage'}</Text><Text style={styles.summaryGenerateArrow}>›</Text></Pressable>{explanation && <View style={styles.learningResult}><Text style={styles.summaryLabel}>SIMPLER EXPLANATION</Text><Text style={styles.summaryBody}>{explanation.simple}</Text><Text style={styles.summaryLabel}>SHORTER</Text><Text style={styles.summaryBody}>{explanation.shorter}</Text><Text style={styles.summaryLabel}>TERMS</Text>{explanation.terms.map((term) => <Text key={term.term} style={styles.summaryTerm}><Text style={styles.summaryTermName}>{term.term}: </Text>{term.definition}</Text>)}<Text style={styles.summaryLimitation}>{explanation.uncertainty}</Text></View>}</>}{tab === 'review' && <><Text style={styles.summaryLabel}>FLASHCARDS & REVIEW QUESTIONS</Text><Text style={styles.learningHint}>Cards are built from headings and source sentences; no outside facts are added.</Text><Pressable style={styles.summaryGenerate} onPress={onCreateCards}><Text style={styles.summaryGenerateText}>Create cards and questions</Text><Text style={styles.summaryGenerateArrow}>›</Text></Pressable>{cards.map((card) => <View key={card.id} style={styles.learningCard}><Text style={styles.learningCardDifficulty}>{card.difficulty.toUpperCase()} · {card.sectionTitle}</Text><Text style={styles.learningCardQuestion}>{card.question}</Text><Text style={styles.learningCardAnswer}>{card.answer}</Text><Text style={styles.learningExcerptText}>Source: {card.sourceExcerpt}</Text></View>)}{review.slice(0, 6).map((entry) => <View key={entry.id} style={styles.learningCard}><Text style={styles.learningCardDifficulty}>{entry.type.replace('-', ' ').toUpperCase()}</Text><Text style={styles.learningCardQuestion}>{entry.question}</Text><Text style={styles.learningCardAnswer}>Answer: {entry.answer}</Text></View>)}</>}{tab === 'academic' && <><Text style={styles.summaryLabel}>SMART ACADEMIC MODE</Text><Text style={styles.learningHint}>Detected sections can be selected for summaries and listening. References remain excluded unless selected.</Text>{academic.length ? academic.map((section) => <View key={section.id} style={styles.learningSection}><Text style={styles.learningCardQuestion}>{section.title || section.academicType}</Text><Text style={styles.learningExcerptText}>{section.academicType ? `Academic section · ${countWords(section.text).toLocaleString()} words` : 'Unclassified section'}</Text></View>) : <Text style={styles.emptyText}>No standard research headings were detected.</Text>}{academic.filter((section) => ['abstract', 'results', 'limitations'].includes(section.academicType || '')).map((section) => <Pressable key={`listen-${section.id}`} style={styles.summaryAction} onPress={() => onListen(section.text)}><Text style={styles.summaryActionText}>▶ Listen to {section.academicType}</Text></Pressable>)}</>}{tab === 'compare' && <><Text style={styles.summaryLabel}>ORIGINAL VS SPOKEN</Text><Text style={styles.learningHint}>The original URL/text stays unchanged. The spoken copy can be reviewed independently.</Text>{spokenPreview && <><Text style={styles.summaryLabel}>SPOKEN COPY</Text><Text style={styles.summaryBody}>{spokenPreview.spoken.slice(0, 1600)}</Text><Text style={styles.summaryLabel}>REMOVED SEGMENTS</Text>{spokenPreview.removed.length ? spokenPreview.removed.map((entry) => <View key={entry.text} style={styles.learningExcerpt}><Text style={styles.learningExcerptText}>{entry.text}</Text><Text style={styles.learningExcerptTitle}>{entry.reason}</Text></View>) : <Text style={styles.emptyText}>No removed segments detected.</Text>}</>}</>}{tab === 'podcast' && <><Text style={styles.summaryLabel}>PODCAST-STYLE SUMMARY</Text><Text style={styles.learningHint}>Generated summary, not a recording. Source sections remain attached to each turn.</Text><Pressable style={styles.summaryGenerate} onPress={onCreatePodcast}><Text style={styles.summaryGenerateText}>Create conversational summary</Text><Text style={styles.summaryGenerateArrow}>›</Text></Pressable>{podcast && <><Text style={styles.summaryBody}>{podcast.turns.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n\n')}</Text><View style={styles.summaryActions}><Pressable style={styles.summaryAction} onPress={() => onListen(podcastText)}><Text style={styles.summaryActionText}>▶ Listen summary</Text></Pressable></View>{podcast.limitations.map((limitation) => <Text key={limitation} style={styles.summaryLimitation}>{limitation}</Text>)}</>}</>}</ScrollView></SafeAreaView></Modal>;
}

function BookmarksModal({ visible, item, bookmarks, chapters, onClose, onJump, onJumpSection, onJumpChapter, onDelete, onCreateNote }: { visible: boolean; item: LibraryItem | null; bookmarks: Bookmark[]; chapters: DocumentChapter[]; onClose: () => void; onJump: (bookmark: Bookmark) => void; onJumpSection: (index: number) => void; onJumpChapter: (chapter: DocumentChapter) => void; onDelete: (bookmark: Bookmark) => void; onCreateNote: (note?: string) => void }) {
  const [note, setNote] = useState('');
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.summaryModal}><View style={styles.modalHeader}><View><Text style={styles.screenTitle}>Bookmarks</Text><Text style={styles.screenSubtitle}>{item ? 'Jump back to a sentence or section.' : 'Nothing is playing.'}</Text></View><Pressable onPress={onClose}><Text style={styles.closeText}>Done</Text></Pressable></View><ScrollView contentContainerStyle={styles.summaryScroll} showsVerticalScrollIndicator={false}><Text style={styles.summaryLabel}>CHAPTERS & HEADINGS</Text>{chapters.length ? chapters.map((chapter) => <Pressable key={chapter.id} style={styles.bookmarkRow} onPress={() => onJumpChapter(chapter)}><View style={styles.grow}><Text style={styles.bookmarkTitle}>{chapter.title}</Text><Text style={styles.bookmarkMeta}>Tap to jump to chapter</Text></View><Text style={styles.rowChevron}>›</Text></Pressable>) : item?.sections?.length ? item.sections.map((section, index) => <Pressable key={section.id} style={styles.bookmarkRow} onPress={() => onJumpSection(index)}><View style={styles.grow}><Text style={styles.bookmarkTitle}>{section.title || `Section ${index + 1}`}</Text><Text style={styles.bookmarkMeta}>Tap to jump · {countWords(section.text).toLocaleString()} words</Text></View><Text style={styles.rowChevron}>›</Text></Pressable>) : <Text style={styles.emptyText}>No headings were detected in this document.</Text>}<Text style={[styles.summaryLabel, { marginTop: space.xl }]}>SAVED SENTENCES</Text>{bookmarks.length ? bookmarks.map((bookmark) => <View key={bookmark.id} style={styles.bookmarkRow}><Pressable style={styles.grow} onPress={() => onJump(bookmark)}><Text style={styles.bookmarkTitle} numberOfLines={2}>{bookmark.note || `Sentence ${bookmark.sentenceIndex + 1}`}</Text><Text style={styles.bookmarkMeta}>{bookmark.note ? `Sentence ${bookmark.sentenceIndex + 1}` : 'Tap to jump'}</Text></Pressable><Pressable onPress={() => onDelete(bookmark)} hitSlop={10}><Text style={styles.deleteText}>Delete</Text></Pressable></View>) : <Text style={styles.emptyText}>Bookmark the current sentence while listening.</Text>}<Text style={[styles.summaryLabel, { marginTop: space.xl }]}>ADD A NOTE TO THE CURRENT SENTENCE</Text><TextInput value={note} onChangeText={setNote} placeholder="Optional note" placeholderTextColor={colors.textTertiary} style={styles.textInput} /><Pressable style={styles.summaryGenerate} onPress={() => { onCreateNote(note); setNote(''); }}><Text style={styles.summaryGenerateText}>Save bookmark</Text><Text style={styles.summaryGenerateArrow}>›</Text></Pressable></ScrollView></SafeAreaView></Modal>;
}


function PlaylistModal({ visible, playlists, items, onClose, onCreate, onRename, onDelete, onUpdateItems, onPlay }: { visible: boolean; playlists: Playlist[]; items: LibraryItem[]; onClose: () => void; onCreate: (name: string) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void; onUpdateItems: (id: string, itemIds: string[]) => void; onPlay: (item: LibraryItem, autoplay?: boolean) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [renameMode, setRenameMode] = useState(false);
  const [addingItems, setAddingItems] = useState(false);
  const selected = playlists.find((playlist) => playlist.id === selectedId);
  const selectedItems = selected?.itemIds.map((id) => items.find((item) => item.id === id)).filter((item): item is LibraryItem => Boolean(item)) ?? [];
  const selectedSeconds = selected ? playlistListeningSeconds(selected, items) : 0;
  const close = () => { setSelectedId(null); setAddingItems(false); setRenameMode(false); onClose(); };
  const toggleItem = (itemId: string) => { if (!selected) return; const next = selected.itemIds.includes(itemId) ? selected.itemIds.filter((id) => id !== itemId) : [...selected.itemIds, itemId]; onUpdateItems(selected.id, next); };
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaView style={styles.playlistModal}><View style={styles.playlistHeader}>{selected ? <Pressable onPress={() => { setSelectedId(null); setAddingItems(false); }} style={styles.playlistBack}><Text style={styles.back}>‹</Text></Pressable> : <View style={styles.playlistHeaderSpacer} />}<View style={styles.playlistHeaderCopy}><Text style={styles.screenTitle}>{selected ? selected.name : 'Your playlists'}</Text><Text style={styles.screenSubtitle}>{selected ? `${selectedItems.length} ${selectedItems.length === 1 ? 'item' : 'items'} · ${displayDuration(selectedSeconds)}` : 'Make a listening space for every mood.'}</Text></View><Pressable onPress={close}><Text style={styles.closeText}>Done</Text></Pressable></View>{selected ? <>{renameMode ? <View style={styles.playlistRename}><TextInput value={renameDraft} onChangeText={setRenameDraft} autoFocus placeholder="Playlist name" placeholderTextColor={colors.textTertiary} style={styles.playlistNameInput} /><Pressable onPress={() => { onRename(selected.id, renameDraft); setRenameMode(false); }} style={styles.playlistSave}><Text style={styles.playlistSaveText}>Save</Text></Pressable></View> : <View style={styles.playlistActions}><Pressable onPress={() => { setRenameDraft(selected.name); setRenameMode(true); }} style={styles.playlistSmallAction}><Text style={styles.playlistSmallActionText}>Rename</Text></Pressable><Pressable onPress={() => Alert.alert('Delete playlist?', 'The saved items will stay in your library.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { onDelete(selected.id); setSelectedId(null); } }])} style={styles.playlistSmallAction}><Text style={styles.playlistDeleteText}>Delete</Text></Pressable></View>}<EstimateBadge seconds={selectedSeconds} label="PLAYLIST LISTENING TIME" /><Pressable onPress={() => setAddingItems(!addingItems)} style={({ pressed }) => [styles.playlistAddButton, pressed && styles.pressed]}><Text style={styles.playlistAddIcon}>{addingItems ? '−' : '+'}</Text><View style={styles.grow}><Text style={styles.playlistAddTitle}>{addingItems ? 'Choose from your library' : 'Add from library'}</Text><Text style={styles.playlistAddMeta}>{addingItems ? 'Tap any item to add or remove it' : 'Keep this playlist growing'}</Text></View><Text style={styles.playlistAddChevron}>{addingItems ? '⌃' : '›'}</Text></Pressable>{addingItems ? <ScrollView contentContainerStyle={styles.playlistItems}>{items.map((item) => { const included = selected.itemIds.includes(item.id); return <Pressable key={item.id} onPress={() => toggleItem(item.id)} style={[styles.playlistItem, included && styles.playlistItemSelected]}><SourceMark item={item} /><View style={styles.grow}><Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.itemMeta}>{included ? 'In this playlist' : typeLabel(item.type)}</Text></View><Text style={styles.playlistCheck}>{included ? '✓' : '+'}</Text></Pressable>; })}</ScrollView> : <ScrollView contentContainerStyle={styles.playlistItems}>{selectedItems.length ? selectedItems.map((item) => <Pressable key={item.id} onPress={() => { onPlay(item, true); close(); }} style={styles.playlistItem}><SourceMark item={item} /><View style={styles.grow}><Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.itemMeta}>{displayDuration(remainingListeningSeconds(item))} left</Text></View><Text style={styles.rowChevron}>›</Text></Pressable>) : <View style={styles.playlistEmpty}><Text style={styles.emptyTitle}>This playlist is empty.</Text><Text style={styles.emptyText}>Add saved text, articles, and documents from your library.</Text></View>}</ScrollView>}</> : <><View style={styles.playlistCreate}><TextInput value={draftName} onChangeText={setDraftName} placeholder="Name a new playlist" placeholderTextColor={colors.textTertiary} style={styles.playlistNameInput} returnKeyType="done" /><Pressable onPress={() => { if (draftName.trim()) { onCreate(draftName); setDraftName(''); } }} style={styles.playlistCreateButton}><Text style={styles.playlistCreateIcon}>+</Text><Text style={styles.playlistCreateText}>Create</Text></Pressable></View><ScrollView contentContainerStyle={styles.playlistList}>{playlists.length ? playlists.map((playlist) => <Pressable key={playlist.id} onPress={() => setSelectedId(playlist.id)} style={({ pressed }) => [styles.playlistCard, pressed && styles.pressed]}><View style={styles.playlistCardIcon}><Text style={styles.playlistCardGlyph}>☷</Text></View><View style={styles.grow}><Text style={styles.playlistCardName}>{playlist.name}</Text><Text style={styles.playlistCardMeta}>{playlist.itemIds.length} {playlist.itemIds.length === 1 ? 'item' : 'items'}<Text style={styles.playlistEstimate}> · {displayDuration(playlistListeningSeconds(playlist, items))}</Text></Text></View><View style={styles.playlistOpenWell}><Text style={styles.playlistOpenText}>Open</Text><Text style={styles.playlistAddChevron}>›</Text></View></Pressable>) : <View style={styles.playlistEmpty}><Text style={styles.emptyTitle}>No playlists yet.</Text><Text style={styles.emptyText}>Create one above, then add any saved item.</Text></View>}</ScrollView></>}</SafeAreaView></Modal>;
}

function QueueModal({ visible, items, onClose, onOpen, onRemove, onClear }: { visible: boolean; items: LibraryItem[]; onClose: () => void; onOpen: (item: LibraryItem) => void; onRemove: (item: LibraryItem) => void; onClear: () => void }) {
  const remaining = items.reduce((seconds, item) => seconds + remainingListeningSeconds(item), 0);
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.queueModal}>
    <View style={styles.queueHeader}><View><Text style={styles.screenTitle}>Your queue</Text><Text style={styles.screenSubtitle}>{items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${formatDuration(remaining).replace('About ', '')}` : 'Save something for later when it suits you.'}</Text></View><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close listening queue"><Text style={styles.closeText}>Done</Text></Pressable></View>
    {items.length ? <>
      <View style={styles.queueEstimateCard}><View style={styles.queueEstimateGlyph}><Text style={styles.queueEstimateGlyphText}>◷</Text></View><View><Text style={styles.queueEstimateLabel}>QUEUE LISTENING TIME</Text><Text style={styles.queueEstimateValue}>{formatDuration(remaining).replace('About ', '')}</Text><Text style={styles.queueEstimateMeta}>Updates as items are added or removed</Text></View></View>
      <Pressable onPress={() => onOpen(items[0])} style={styles.queueStart} accessibilityRole="button" accessibilityLabel={`Play next, ${items[0].title}`}><View style={styles.queueStartPlay}><Text style={styles.queueStartPlayIcon}>▶</Text></View><View style={styles.grow}><Text style={styles.queueStartLabel}>UP NEXT</Text><Text style={styles.queueStartTitle} numberOfLines={1}>{items[0].title}</Text></View></Pressable>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        style={styles.queueFlatList}
        contentContainerStyle={styles.queueList}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        accessibilityLabel={`Listening queue, ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        renderItem={({ item, index }) => <Pressable style={styles.queueItem} onPress={() => onOpen(item)} onLongPress={() => onRemove(item)} accessibilityRole="button" accessibilityLabel={`${index + 1}. ${item.title}. Hold to remove from queue.`}><Text style={styles.queueIndex}>{index + 1}</Text><SourceMark item={item} /><View style={styles.grow}><Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.itemMeta}>{formatDuration(remainingListeningSeconds(item)).replace('About ', '')} left</Text></View><Text style={styles.rowChevron}>›</Text></Pressable>}
        ListFooterComponent={<View style={styles.queueListEnd} />}
      />
      <Pressable onPress={onClear} style={styles.clearQueue} accessibilityRole="button" accessibilityLabel="Clear listening queue"><Text style={styles.clearQueueText}>Clear queue</Text></Pressable>
    </> : <View style={styles.queueEmpty}><Text style={styles.emptyTitle}>Nothing queued yet.</Text><Text style={styles.emptyText}>After importing something, choose Play next or Add to queue.</Text></View>}
  </SafeAreaView></Modal>;
}


function ItemRow({ item, onPress, onLongPress, onToggleFavorite }: { item: LibraryItem; onPress: () => void; onLongPress?: () => void; onToggleFavorite?: () => void }) { const bookMeta = longDocumentMeta(item); return <Pressable style={styles.itemRow} onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${typeLabel(item.type)}`}><SourceMark item={item} /><View style={styles.grow}><Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.itemMeta}>{item.author ? `${item.author} · ` : ''}{bookMeta ?? `${item.source || typeLabel(item.type)} · ${item.progress > 0 ? `${Math.round(item.progress * 100)}% complete · ${formatDuration(remainingListeningSeconds(item)).replace('About ', '')} left` : `${formatDuration(remainingListeningSeconds(item)).replace('About ', '')} listening`}`}</Text>{item.progress > 0 && <Progress value={item.progress} compact />}</View>{onToggleFavorite && <Pressable onPress={onToggleFavorite} hitSlop={10} accessibilityLabel={item.favorite ? 'Remove favorite' : 'Add favorite'}><Text style={styles.favoriteMark}>{item.favorite ? '★' : '☆'}</Text></Pressable>}<Text style={styles.rowChevron}>›</Text></Pressable>; }
function SourceMark({ item }: { item: LibraryItem }) { return <View style={[styles.sourceMark, item.type === 'article' && styles.sourceMarkArticle]}><Text style={styles.sourceSymbol}>{item.type === 'text' ? 'T' : item.type === 'article' ? '↗' : '▤'}</Text></View>; }
function Progress({ value, compact = false, onChange }: { value: number; compact?: boolean; onChange?: (value: number) => void }) {
  const [width, setWidth] = useState(1);
  const setFromPosition = useCallback((locationX: number) => onChange?.(Math.max(0, Math.min(1, locationX / width))), [onChange, width]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => Boolean(onChange),
    onMoveShouldSetPanResponder: (_, gesture) => Boolean(onChange) && Math.abs(gesture.dx) >= Math.abs(gesture.dy),
    onPanResponderGrant: (event) => setFromPosition(event.nativeEvent.locationX),
    onPanResponderMove: (event) => setFromPosition(event.nativeEvent.locationX),
    onPanResponderRelease: (event) => setFromPosition(event.nativeEvent.locationX),
  }), [onChange, setFromPosition]);
  const track = <View style={[styles.progressTrack, compact && styles.compactProgress]}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, value * 100))}%` }]} /></View>;
  if (!onChange) return track;
  return <View {...panResponder.panHandlers} onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))} style={{ minHeight: 32, justifyContent: 'center' }} accessibilityRole="adjustable" accessibilityLabel="Listening progress" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100), text: `${Math.round(value * 100)}% complete` }}>{track}</View>;
}

function MarqueeText({ text, containerStyle, textStyle }: { text: string; containerStyle?: object; textStyle?: object }) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    if (contentWidth <= viewportWidth || !viewportWidth) return;
    const distance = contentWidth - viewportWidth + 14;
    const animation = Animated.loop(Animated.sequence([Animated.delay(1300), Animated.timing(translateX, { toValue: -distance, duration: Math.max(3200, distance * 34), useNativeDriver: true }), Animated.delay(900), Animated.timing(translateX, { toValue: 0, duration: 420, useNativeDriver: true })]));
    animation.start();
    return () => animation.stop();
  }, [contentWidth, translateX, viewportWidth]);
  return <View style={[{ overflow: 'hidden' }, containerStyle]} onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}><Animated.View style={{ alignSelf: 'flex-start', flexShrink: 0, transform: [{ translateX }] }}><Text style={textStyle} numberOfLines={1} onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}>{text}</Text></Animated.View></View>;
}
function typeLabel(type: ItemType) { return type === 'text' ? 'Pasted text' : type === 'article' ? 'Article' : 'Document'; }

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.backgroundPrimary }, scroll: { padding: space.xl, paddingBottom: 120 }, fullScreen: { flex: 1, backgroundColor: colors.backgroundPrimary }, grow: { flex: 1 }, pressed: { opacity: 0.84 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xs, marginBottom: space.xxxl }, brandMark: { ...type.title, color: colors.textPrimary, letterSpacing: -0.8 }, eyebrow: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1.25, marginTop: 2 }, privacy: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.accentSoft, borderRadius: radius.pill }, privacyIcon: { color: colors.accentPrimary, fontWeight: '700' }, privacyText: { ...type.caption, color: colors.accentPrimary },
  display: { ...type.display, fontSize: 36, lineHeight: 42, color: colors.textPrimary }, intro: { ...type.body, color: colors.textSecondary, marginTop: space.xs, maxWidth: 310 }, importGroup: { marginTop: space.xxl, gap: space.sm }, importButton: { minHeight: 86, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.borderSubtle }, importPrimary: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary, shadowColor: colors.accentPrimary, shadowOpacity: 0.22, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14, elevation: 4 }, importIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, backgroundColor: colors.accentSoft }, importIconPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' }, importSymbol: { ...type.title, color: colors.accentPrimary }, importSymbolPrimary: { color: '#FFFFFF' }, importTitle: { ...type.heading, color: colors.textPrimary }, importTitlePrimary: { color: '#FFFFFF' }, importDescription: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, importDescriptionPrimary: { color: 'rgba(255,255,255,0.76)' }, chevron: { fontSize: 28, color: colors.textTertiary }, chevronPrimary: { color: '#FFFFFF' }, importDivider: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg, marginBottom: space.sm }, importDividerRule: { flex: 1, height: 1, backgroundColor: colors.divider }, importDividerBadge: { minHeight: 28, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' }, importDividerText: { ...type.caption, color: colors.accentPrimary, fontSize: 10, letterSpacing: 0.8 }, otherImports: { marginTop: 0, alignItems: 'center' }, otherImportsLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.8, marginBottom: space.xs }, otherImportActions: { flexDirection: 'row', gap: space.sm }, otherImportButton: { minHeight: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 }, otherImportIcon: { fontSize: 16, color: colors.accentPrimary }, otherImportText: { ...type.caption, color: colors.accentPrimary },
  sectionTitle: { ...type.title, color: colors.textPrimary, marginTop: space.xxxl, marginBottom: space.sm }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, allLabel: { ...type.label, color: colors.textTertiary, marginTop: space.xxxl }, continueCard: { padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle }, continueTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }, sourceMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, articleMark: { backgroundColor: '#E4F3F0' }, sourceSymbol: { ...type.heading, color: colors.accentPrimary }, cardTitle: { ...type.heading, color: colors.textPrimary }, meta: { ...type.caption, color: colors.textSecondary, marginTop: 3 }, playSmall: { width: 32, height: 32, textAlign: 'center', textAlignVertical: 'center', color: '#FFFFFF', backgroundColor: colors.accentPrimary, borderRadius: radius.pill, overflow: 'hidden', fontSize: 13, paddingLeft: 2 }, progressTrack: { height: 6, backgroundColor: colors.remainingProgress, borderRadius: radius.pill, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: colors.completedProgress, borderRadius: radius.pill }, compactProgress: { height: 3, marginTop: 8 }, remaining: { ...type.caption, color: colors.textSecondary, marginTop: space.sm },
  empty: { paddingVertical: space.lg, alignItems: 'center', textAlign: 'center' }, emptyWave: { height: 66, width: 88, marginBottom: space.sm, alignItems: 'center', justifyContent: 'center' }, emptyPage: { fontSize: 48, color: colors.accentPrimary }, wave: { position: 'absolute', fontSize: 24, color: colors.accentSecondary, right: -2, bottom: 2 }, emptyTitle: { ...type.title, color: colors.textPrimary, textAlign: 'center' }, emptyText: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.xs, maxWidth: 290 }, textAction: { marginTop: space.md, padding: space.xs }, textActionLabel: { ...type.label, color: colors.accentPrimary },
  itemRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.divider }, itemTitle: { ...type.label, color: colors.textPrimary }, itemMeta: { ...type.caption, color: colors.textSecondary, marginTop: 3 }, rowChevron: { color: colors.textTertiary, fontSize: 24 }, libraryHeader: { padding: space.xl, paddingBottom: space.md }, screenTitle: { ...type.display, color: colors.textPrimary, fontSize: 30 }, screenSubtitle: { ...type.body, color: colors.textSecondary, marginTop: space.xs }, search: { marginTop: space.xl, flexDirection: 'row', alignItems: 'center', height: 45, borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, paddingHorizontal: space.sm, borderWidth: 1, borderColor: colors.borderSubtle }, searchIcon: { color: colors.textTertiary, fontSize: 22, marginRight: space.xs }, searchInput: { ...type.body, flex: 1, color: colors.textPrimary }, libraryList: { paddingHorizontal: space.xl, paddingBottom: 140 }, libraryEmpty: { paddingTop: 80, alignItems: 'center' },
  settingsScreen: { padding: space.xl, paddingBottom: 130 }, settingsSection: { marginTop: space.xxl }, settingsHeading: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: space.xs }, settingsCard: { backgroundColor: colors.surfacePrimary, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderSubtle, overflow: 'hidden' }, settingRow: { minHeight: 56, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, settingLabel: { ...type.label, color: colors.textPrimary }, settingValue: { ...type.label, color: colors.textSecondary }, settingHelp: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, privacyCopy: { ...type.label, color: colors.textSecondary, lineHeight: 21, padding: space.md },
  miniPlayer: { position: 'absolute', bottom: 69, left: space.md, right: space.md, height: 76, borderRadius: radius.medium, paddingLeft: 12, paddingRight: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)', borderBottomColor: 'rgba(0,0,0,0.74)', shadowColor: '#000000', shadowOpacity: 0.24, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 8, zIndex: 1 }, miniOpen: { flex: 1, flexDirection: 'row', gap: space.sm, alignItems: 'center' }, miniTitle: { ...type.label, color: colors.textPrimary, fontSize: 15, lineHeight: 20, fontWeight: '700' }, miniPausedLabel: { color: colors.accentPrimary, fontSize: 11, letterSpacing: 0.6 }, miniToggle: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center', marginLeft: space.sm }, miniToggleIcon: { color: '#FFFFFF', fontSize: 18, paddingLeft: 1 }, tabBar: { height: 72, backgroundColor: 'rgba(255,255,255,0.96)', borderTopWidth: 1, borderColor: colors.borderSubtle, flexDirection: 'row', paddingBottom: Platform.OS === 'ios' ? 6 : 0 }, tabBarWithPlayer: { paddingTop: 0 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 }, tabIcon: { color: colors.textTertiary, fontSize: 19 }, tabLabel: { ...type.caption, color: colors.textTertiary }, tabSelected: { color: colors.accentPrimary },
  playerScreen: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.md, backgroundColor: colors.backgroundPrimary }, playerHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 45 }, back: { color: colors.textPrimary, fontSize: 31, minWidth: 44 }, playerHeadText: { flex: 1, alignItems: 'center', paddingHorizontal: space.xs }, playerTitle: { ...type.label, color: colors.textPrimary }, playerSource: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, more: { color: colors.textPrimary, fontSize: 17, minWidth: 44, textAlign: 'right', letterSpacing: 2 }, nowPlaying: { marginTop: space.xxl }, nowPlayingLabel: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1.1 }, chapterTitle: { ...type.title, color: colors.textPrimary, marginTop: 4 }, passageScroll: { flex: 1, marginTop: space.lg }, passageContent: { paddingVertical: space.md, gap: space.xs }, sentence: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.medium }, currentSentence: { backgroundColor: colors.currentSentence }, sentenceText: { fontSize: 20, lineHeight: 31, color: colors.textTertiary }, currentSentenceText: { color: colors.textPrimary, fontWeight: '600' }, progressArea: { marginBottom: space.md }, progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs }, progressMeta: { ...type.caption, color: colors.textSecondary }, mainControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxl, marginBottom: space.lg }, skipButton: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' }, skipIcon: { color: colors.textPrimary, fontSize: 23, letterSpacing: -4 }, playButton: { height: 70, width: 70, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.accentPrimary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14 }, playIcon: { color: '#FFFFFF', fontSize: 27, paddingLeft: 2 }, quickControls: { flexDirection: 'row', gap: space.xs, marginBottom: space.md }, quickControl: { flex: 1, minHeight: 56, backgroundColor: colors.surfacePrimary, borderRadius: radius.medium, padding: space.sm, borderWidth: 1, borderColor: colors.borderSubtle, justifyContent: 'center' }, quickCaption: { ...type.caption, color: colors.textTertiary, fontSize: 10, letterSpacing: 0.6 }, quickValue: { ...type.label, color: colors.textPrimary, marginTop: 2 }, advanced: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surfacePrimary, borderTopLeftRadius: radius.xlarge, borderTopRightRadius: radius.xlarge, padding: space.xl, shadowColor: '#000', shadowOpacity: 0.16, shadowOffset: { width: 0, height: -5 }, shadowRadius: 16, elevation: 12 }, advancedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg }, advancedTitle: { ...type.title, color: colors.textPrimary }, closeText: { ...type.label, color: colors.accentPrimary }, controlLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.7, marginBottom: space.xs, marginTop: space.sm }, optionRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }, option: { flex: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 8, backgroundColor: colors.backgroundSecondary, borderRadius: radius.small }, speedOption: { minWidth: 51, flexGrow: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: colors.backgroundSecondary, borderRadius: radius.small }, optionSelected: { backgroundColor: colors.accentPrimary }, optionText: { ...type.label, color: colors.textSecondary }, optionTextSelected: { color: '#FFFFFF' },
  playerScroll: { flex: 1, marginTop: space.sm }, playerContent: { paddingTop: space.md, paddingBottom: space.xxxl, gap: space.md }, playerHeadKicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1.1 }, playerArtwork: { padding: space.xl, alignItems: 'center' }, artworkTop: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, artworkBadge: { paddingHorizontal: space.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.accentSoft }, artworkBadgeText: { ...type.caption, color: colors.accentPrimary, letterSpacing: 0.9, fontSize: 10 }, artworkStatus: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.8 }, artworkMark: { width: 104, height: 104, marginTop: space.lg, borderRadius: radius.xlarge, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', borderBottomColor: 'rgba(0,0,0,0.65)', shadowColor: colors.accentPrimary, shadowOpacity: 0.12, shadowOffset: { width: 0, height: 0 }, shadowRadius: 22, elevation: 4 }, artworkMarkAction: { overflow: 'hidden' }, artworkMarkPressed: { transform: [{ scale: 0.97 }], shadowOpacity: 0.22, shadowRadius: 16, elevation: 3 }, artworkGlyph: { color: colors.accentPrimary, fontSize: 44, fontWeight: '800' }, artworkWave: { position: 'absolute', right: 12, bottom: 10, color: colors.accentSecondary, fontSize: 20 }, artworkTitle: { ...type.title, color: colors.textPrimary, textAlign: 'center', marginTop: space.lg, maxWidth: 260 }, artworkSource: { ...type.caption, color: colors.textSecondary, marginTop: 4 }, dialHint: { ...type.caption, color: colors.textTertiary, textAlign: 'center', marginTop: space.xs }, playerIdentity: { paddingHorizontal: space.xs }, playerDocumentTitle: { ...type.title, color: colors.textPrimary, marginTop: 4 }, currentCard: { padding: space.lg }, currentKicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1 }, currentText: { ...type.body, color: colors.textPrimary, marginTop: space.sm }, readerPreviewToggle: { minHeight: 72, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.68)', flexDirection: 'row', alignItems: 'center', gap: space.sm }, readerPreviewKicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 0.9 }, readerPreviewTitle: { ...type.label, color: colors.textPrimary, marginTop: 3 }, readerPreviewMeta: { ...type.caption, color: colors.textSecondary, marginTop: 3 }, readerPreviewChevron: { color: colors.accentPrimary, fontSize: 28, width: 24, textAlign: 'center' }, passagePreview: { gap: 4 }, passageLine: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.small }, passageLineCurrent: { backgroundColor: colors.currentSentence }, passageLineText: { ...type.caption, color: colors.textTertiary, lineHeight: 18 }, passageLineTextCurrent: { color: colors.textSecondary }, playerPlayButton: { height: 74, width: 74, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.20)', shadowColor: colors.accentPrimary, shadowOpacity: 0.42, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 9 }, playerPlayPressed: { transform: [{ scale: 0.94 }], shadowOpacity: 0.2, elevation: 3 },
  playerEmpty: { flex: 1, justifyContent: 'center', paddingBottom: space.xxxl }, playerEmptyCard: { padding: space.xl, alignItems: 'center' }, emptyArtwork: { width: 112, height: 112, borderRadius: radius.xlarge, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.6)', borderBottomColor: 'rgba(255,255,255,0.06)' }, emptyArtworkGlyph: { color: colors.accentPrimary, fontSize: 54 }, emptyArtworkWave: { position: 'absolute', right: 15, bottom: 14, color: colors.accentSecondary, fontSize: 22 }, playerEmptyTitle: { ...type.title, color: colors.textPrimary, marginTop: space.xl, textAlign: 'center' }, playerEmptyText: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.xs, maxWidth: 280 }, playerEmptyActions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.xl }, playerEmptyPrimary: { minHeight: 54, paddingHorizontal: space.lg, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: colors.accentPrimary, shadowOpacity: 0.28, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14, elevation: 5 }, playerEmptyPrimaryText: { ...type.heading, color: '#FFFFFF' }, playerEmptyArrow: { color: '#FFFFFF', fontSize: 28 }, playerEmptySecondary: { minHeight: 48, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }, playerEmptySecondaryText: { ...type.label, color: colors.textPrimary }, playerEmptyPressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
  voiceModal: { flex: 1, padding: space.xl, backgroundColor: colors.backgroundPrimary }, voiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, voiceIntro: { ...type.body, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.lg }, voiceRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider }, voiceName: { ...type.label, color: colors.textPrimary }, voiceLanguage: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, voiceCheck: { color: colors.accentPrimary, fontSize: 21 },
  importModal: { flex: 1, padding: space.xl, backgroundColor: colors.backgroundPrimary }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.xl }, summaryModalHeader: { paddingTop: space.md }, titleInputWrap: { marginBottom: space.sm }, inputLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.7, marginBottom: 5 }, titleInput: { ...type.body, height: 48, paddingHorizontal: space.sm, backgroundColor: colors.surfacePrimary, borderRadius: radius.small, borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary }, textEditor: { ...type.body, color: colors.textPrimary, flex: 1, minHeight: 210, padding: space.md, backgroundColor: colors.surfacePrimary, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderSubtle }, editorFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.sm }, clipboard: { paddingVertical: space.xs }, clipboardText: { ...type.label, color: colors.accentPrimary }, wordMeta: { ...type.caption, color: colors.textSecondary, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.small, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.45)', borderBottomColor: 'rgba(255,255,255,0.06)' }, linkInput: { ...type.body, height: 54, paddingHorizontal: space.md, color: colors.textPrimary, backgroundColor: colors.surfacePrimary, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderSubtle }, linkHelp: { marginTop: space.lg, padding: space.md, backgroundColor: colors.accentSoft, borderRadius: radius.medium }, linkHelpTitle: { ...type.label, color: colors.accentPrimary }, linkHelpText: { ...type.caption, lineHeight: 18, color: colors.textSecondary, marginTop: 4 }, modalPrimary: { height: 56, marginTop: space.xl, backgroundColor: colors.accentPrimary, borderRadius: radius.medium, flexDirection: 'row', paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'space-between' }, disabled: { opacity: 0.5 }, modalPrimaryText: { ...type.heading, color: '#FFFFFF' }, modalPrimaryArrow: { color: '#FFFFFF', fontSize: 28 }, loadingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(23,23,33,0.72)', alignItems: 'center', justifyContent: 'center', gap: space.md }, loadingText: { ...type.label, color: '#FFFFFF' },
  preparedBackdrop: { flex: 1, backgroundColor: 'rgba(12,15,18,0.72)', justifyContent: 'flex-end', padding: space.md }, preparedCard: { backgroundColor: colors.surfacePrimary, borderRadius: radius.xlarge, padding: space.xxl, alignItems: 'center' }, successMark: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' }, successIcon: { color: colors.success, fontSize: 28, fontWeight: '700' }, preparedKicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 1.2, marginTop: space.lg }, preparedTitle: { ...type.title, color: colors.textPrimary, textAlign: 'center', marginTop: space.xs }, preparedMessage: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.xs }, preparedMeta: { flexDirection: 'row', gap: space.xs, marginTop: space.sm, ...type.caption, color: colors.textSecondary }, playNow: { height: 58, backgroundColor: colors.accentPrimary, borderRadius: radius.medium, alignSelf: 'stretch', marginTop: space.xl, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, playNowIcon: { color: '#FFFFFF', fontSize: 15 }, playNowText: { ...type.heading, color: '#FFFFFF' }, preparedActions: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'center', gap: space.xs }, secondaryModalAction: { padding: space.md, marginTop: space.xs }, secondaryModalLabel: { ...type.label, color: colors.textSecondary },
  queuePreview: { marginTop: space.xxl, minHeight: 76, padding: space.md, borderRadius: radius.large, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', gap: space.sm }, queuePreviewIcon: { height: 42, width: 42, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' }, queuePreviewGlyph: { color: '#FFFFFF', fontSize: 22 }, queuePreviewTitle: { ...type.heading, color: colors.textPrimary }, queuePreviewMeta: { ...type.caption, color: colors.textSecondary, marginTop: 3 },
  legalModal: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.xl }, legalHeader: { paddingTop: space.md, paddingBottom: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, legalEffective: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.75, marginTop: 5 }, legalScroll: { paddingBottom: space.xxxl }, legalIntro: { padding: space.lg, backgroundColor: colors.accentSoft, borderRadius: radius.large, flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xxl }, legalIntroMark: { fontSize: 28, color: colors.accentPrimary }, legalIntroText: { ...type.heading, color: colors.accentPrimary, flex: 1 }, legalSection: { marginBottom: space.xl }, legalHeading: { ...type.heading, color: colors.textPrimary, marginBottom: space.xs }, legalBody: { ...type.body, color: colors.textSecondary },
  queueModal: { flex: 1, backgroundColor: colors.backgroundPrimary, padding: space.xl }, queueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, queueStart: { marginTop: space.xxl, padding: space.md, borderRadius: radius.large, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.accentPrimary }, queueStartPlay: { height: 42, width: 42, borderRadius: radius.pill, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, queueStartPlayIcon: { color: colors.accentPrimary, fontSize: 15, paddingLeft: 2 }, queueStartLabel: { ...type.caption, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8 }, queueStartTitle: { ...type.heading, color: '#FFFFFF', marginTop: 2 }, queueFlatList: { flex: 1, marginTop: space.lg }, queueList: { paddingBottom: space.sm }, queueListEnd: { height: space.sm }, queueItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 64, borderBottomWidth: 1, borderBottomColor: colors.divider }, queueIndex: { ...type.caption, color: colors.textTertiary, width: 15, textAlign: 'center' }, clearQueue: { alignSelf: 'center', padding: space.md, marginTop: space.sm }, clearQueueText: { ...type.label, color: colors.error }, queueEmpty: { paddingTop: 110, alignItems: 'center' },
  onboarding: { flex: 1, backgroundColor: colors.backgroundPrimary, padding: space.xl, justifyContent: 'space-between' }, onboardingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, skipOnboarding: { ...type.label, color: colors.textSecondary, padding: space.xs }, onboardingCenter: { alignItems: 'center', paddingHorizontal: space.md, marginTop: -30 }, onboardingMark: { width: 112, height: 112, borderRadius: 36, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xxl }, onboardingGlyph: { color: colors.accentPrimary, fontSize: 52 }, onboardingWave: { position: 'absolute', color: colors.accentSecondary, fontSize: 24, right: 14, bottom: 17 }, onboardingTitle: { ...type.display, color: colors.textPrimary, textAlign: 'center', fontSize: 34, lineHeight: 40 }, onboardingBody: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: space.md, maxWidth: 310 }, onboardingDots: { alignSelf: 'center', flexDirection: 'row', gap: 7, marginBottom: space.lg }, onboardingDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.borderSubtle }, onboardingDotActive: { width: 22, backgroundColor: colors.accentPrimary }, onboardingButton: { height: 57, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, flexDirection: 'row' }, onboardingButtonText: { ...type.heading, color: '#FFFFFF' }, onboardingButtonArrow: { color: '#FFFFFF', fontSize: 28 },
  tabBarShell: { height: 74, marginHorizontal: space.md, marginBottom: space.xs, padding: 6, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', shadowColor: '#000', shadowOpacity: 0.38, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 9 }, tabActive: { backgroundColor: colors.surfacePressed, borderRadius: radius.medium },
  sourceMarkArticle: { backgroundColor: '#202936' },
  importRaised: { borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.68)', shadowColor: '#000', shadowOpacity: 0.26, shadowOffset: { width: 0, height: 6 }, shadowRadius: 10, elevation: 4 }, importButtonPressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  otherImportRaised: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', borderBottomColor: 'rgba(0,0,0,0.64)', shadowColor: '#000', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 4 }, shadowRadius: 7, elevation: 3 },
  importCoverage: { marginTop: space.md, padding: space.lg, borderRadius: radius.large }, importCoverageHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm }, importCoverageKicker: { minHeight: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: 'rgba(255,113,56,0.24)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, importCoverageKickerText: { ...type.caption, color: colors.accentPrimary, fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.7 }, importCoverageTitle: { ...type.heading, color: colors.textPrimary, flex: 1, minWidth: 0, flexShrink: 1 }, importFormatRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.xs, marginTop: space.md }, importFormat: { width: '22%', minHeight: 32, paddingHorizontal: 6, borderRadius: radius.small, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.55)', borderBottomColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }, importFormatText: { ...type.caption, color: colors.textSecondary, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.55 }, importCoverageText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: space.md },
  libraryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm }, libraryTitleCopy: { flex: 1, minWidth: 0 }, libraryPlaylistButton: { width: 132, minHeight: 52, paddingHorizontal: space.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,113,56,0.28)', borderBottomColor: 'rgba(255,113,56,0.18)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0, shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 7, elevation: 3 }, libraryPlaylistIcon: { width: 20, color: colors.accentPrimary, fontSize: 19, textAlign: 'center', textShadowColor: 'rgba(255,113,56,0.30)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 } }, libraryPlaylistLabel: { ...type.label, color: colors.textPrimary, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  playlistModal: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.xl }, playlistHeader: { paddingTop: space.md, paddingBottom: space.lg, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }, playlistHeaderSpacer: { width: 30 }, playlistBack: { width: 34, height: 42, alignItems: 'center', justifyContent: 'center' }, playlistHeaderCopy: { flex: 1 }, playlistCreate: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg }, playlistNameInput: { flex: 1, minHeight: 50, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.55)', borderBottomColor: 'rgba(255,255,255,0.07)', color: colors.textPrimary, ...type.body }, playlistCreateButton: { minHeight: 50, paddingHorizontal: space.sm, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, flexDirection: 'row', alignItems: 'center', gap: 4 }, playlistCreateIcon: { color: '#FFFFFF', fontSize: 22 }, playlistCreateText: { ...type.label, color: '#FFFFFF' }, playlistList: { paddingBottom: space.xxxl, gap: space.sm }, playlistCard: { minHeight: 82, padding: space.sm, borderRadius: radius.large, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.62)', flexDirection: 'row', alignItems: 'center', gap: space.sm, shadowColor: '#000', shadowOpacity: 0.26, shadowOffset: { width: 0, height: 7 }, shadowRadius: 12, elevation: 5 }, playlistCardIcon: { width: 48, height: 48, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.55)', borderBottomColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }, playlistCardGlyph: { color: colors.accentPrimary, fontSize: 22 }, playlistCardName: { ...type.heading, color: colors.textPrimary }, playlistCardMeta: { ...type.caption, color: colors.textSecondary, marginTop: 3 }, playlistEstimate: { color: colors.accentPrimary }, playlistOpenWell: { minHeight: 38, paddingHorizontal: space.sm, borderRadius: radius.small, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.55)', borderBottomColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', gap: 4 }, playlistOpenText: { ...type.caption, color: colors.textSecondary }, playlistActions: { flexDirection: 'row', gap: space.sm, marginBottom: space.md }, playlistSmallAction: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.small, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', borderBottomColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }, playlistSmallActionText: { ...type.caption, color: colors.textPrimary }, playlistDeleteText: { ...type.caption, color: colors.error }, playlistRename: { flexDirection: 'row', gap: space.sm, marginBottom: space.md }, playlistSave: { minHeight: 50, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' }, playlistSaveText: { ...type.label, color: '#FFFFFF' }, playlistAddButton: { minHeight: 76, padding: space.sm, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.65)', flexDirection: 'row', alignItems: 'center', gap: space.sm, shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 5 }, shadowRadius: 9, elevation: 4 }, playlistAddIcon: { width: 34, height: 34, borderRadius: radius.small, backgroundColor: colors.accentPrimary, color: '#FFFFFF', fontSize: 24, textAlign: 'center', textAlignVertical: 'center' }, playlistAddTitle: { ...type.label, color: colors.textPrimary }, playlistAddMeta: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, playlistAddChevron: { color: colors.accentPrimary, fontSize: 24, width: 22, textAlign: 'center' }, playlistItems: { paddingVertical: space.md, paddingBottom: space.xxxl, gap: 4 }, playlistItem: { minHeight: 66, paddingHorizontal: space.sm, borderRadius: radius.medium, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.divider }, playlistItemSelected: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentPrimary }, playlistCheck: { color: colors.accentPrimary, fontSize: 21, width: 24, textAlign: 'center' }, playlistEmpty: { alignItems: 'center', paddingTop: 90 },
  estimateBadge: { alignSelf: 'stretch', minHeight: 54, marginTop: space.md, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.55)', borderBottomColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'center', gap: space.sm }, estimateIcon: { color: colors.accentPrimary, fontSize: 22 }, estimateCopy: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.7 }, estimateValue: { ...type.label, color: colors.textPrimary, marginTop: 2 }, queueEstimateCard: { marginTop: space.lg, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.66)', flexDirection: 'row', alignItems: 'center', gap: space.sm, shadowColor: '#000', shadowOpacity: 0.23, shadowOffset: { width: 0, height: 5 }, shadowRadius: 9, elevation: 4 }, queueEstimateGlyph: { width: 42, height: 42, borderRadius: radius.medium, backgroundColor: colors.accentSoft, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.45)', borderBottomColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }, queueEstimateGlyphText: { color: colors.accentPrimary, fontSize: 22 }, queueEstimateLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.8 }, queueEstimateValue: { ...type.title, color: colors.textPrimary, marginTop: 2 }, queueEstimateMeta: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  articlePreviewModal: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.xl }, articlePreviewScroll: { paddingBottom: space.xl }, articlePreviewSource: { padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.68)' }, articlePreviewKicker: { ...type.caption, color: colors.accentPrimary, letterSpacing: 0.9 }, articlePreviewDomain: { ...type.heading, color: colors.textPrimary, marginTop: 3 }, articlePreviewMeta: { ...type.caption, color: colors.textSecondary, marginTop: 4 }, articlePreviewTitle: { ...type.display, color: colors.textPrimary, fontSize: 28, lineHeight: 34, marginTop: space.xl }, articlePreviewAuthors: { ...type.body, color: colors.textSecondary, marginTop: space.xs }, articlePreviewWarning: { marginTop: space.lg, padding: space.md, borderRadius: radius.medium, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }, articlePreviewWarningIcon: { width: 26, height: 26, borderRadius: radius.pill, backgroundColor: colors.accentPrimary, color: '#FFFFFF', textAlign: 'center', textAlignVertical: 'center', fontWeight: '800' }, articlePreviewWarningTitle: { ...type.label, color: colors.accentPrimary }, articlePreviewWarningText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 3 }, articlePreviewTextCard: { marginTop: space.lg, padding: space.lg, borderRadius: radius.large, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.66)', borderBottomColor: 'rgba(255,255,255,0.06)' }, articlePreviewTextLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.8 }, articlePreviewText: { ...type.body, color: colors.textPrimary, marginTop: space.sm }, articlePreviewStored: { ...type.caption, color: colors.textTertiary, lineHeight: 18, marginTop: space.md }, articlePreviewActions: { paddingVertical: space.sm, gap: space.sm, flexDirection: 'row' }, articlePreviewEdit: { minHeight: 54, flex: 0.8, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.62)', borderBottomColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' }, articlePreviewEditText: { ...type.label, color: colors.textPrimary }, articlePreviewContinue: { minHeight: 54, flex: 1.4, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, articlePreviewContinueText: { ...type.heading, color: '#FFFFFF' }, articlePreviewArrow: { color: '#FFFFFF', fontSize: 27 },
  playerKickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%' }, freePlayerHeaderPillHit: { minHeight: 44, justifyContent: 'center' }, freePlayerHeaderPill: { minHeight: 24, maxWidth: 116, paddingHorizontal: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: 'rgba(216,180,90,0.10)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.40)', flexDirection: 'row', alignItems: 'center', gap: 5, shadowColor: colors.recommendedGoldBright, shadowOpacity: 0.12, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5, elevation: 2 }, freePlayerHeaderPillCritical: { backgroundColor: colors.accentSoft, borderColor: 'rgba(255,113,56,0.42)' }, freePlayerHeaderPillPressed: { shadowOpacity: 0.04, elevation: 1 }, freePlayerHeaderPillHighlight: { position: 'absolute', left: 8, right: 8, top: 1, height: 1, borderRadius: radius.pill, backgroundColor: 'rgba(244,215,124,0.26)' }, freePlayerHeaderLabel: { ...type.caption, color: colors.recommendedGold, fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.65 }, freePlayerHeaderSeparator: { width: 2, height: 2, borderRadius: radius.pill, backgroundColor: colors.recommendedGoldDark }, freePlayerHeaderTime: { ...type.caption, color: colors.recommendedGoldBright, fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.1 }, freePlayerHeaderChevron: { color: colors.recommendedGold, fontSize: 14, lineHeight: 14 }, playerModePill: { maxWidth: 116, minHeight: 40, paddingHorizontal: 8, borderRadius: radius.small, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.65)', justifyContent: 'center' }, playerModeKicker: { ...type.caption, color: colors.accentPrimary, fontSize: 9, letterSpacing: 0.7 }, playerModeValue: { ...type.caption, color: colors.textPrimary, marginTop: 1 }, importDividerSpaced: { marginTop: space.xxxl }, continueDivider: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, marginBottom: space.xs }, continueTitle: { marginTop: space.md },
  preparedWarning: { ...type.caption, color: colors.accentPrimary, lineHeight: 18, marginTop: space.sm, textAlign: 'center' }, articlePreviewSections: { marginTop: space.lg, padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.58)', borderBottomColor: 'rgba(255,255,255,0.06)' }, articlePreviewSection: { ...type.caption, color: colors.textSecondary, lineHeight: 19, marginTop: 5 }, summaryEntry: { minHeight: 72, padding: space.sm, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', borderBottomColor: 'rgba(0,0,0,0.68)', flexDirection: 'row', alignItems: 'center', gap: space.sm }, summaryEntryIcon: { width: 42, height: 42, borderRadius: radius.medium, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, summaryEntryGlyph: { color: colors.accentPrimary, fontSize: 24 }, summaryEntryTitle: { ...type.label, color: colors.textPrimary }, summaryEntryText: { ...type.caption, color: colors.textSecondary, marginTop: 3 }, summaryEntryChevron: { color: colors.accentPrimary, fontSize: 26 }, summaryModal: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.xl }, summaryScroll: { paddingBottom: space.xxxl, gap: space.sm }, summaryPrivacy: { padding: space.md, borderRadius: radius.medium, backgroundColor: colors.accentSoft, flexDirection: 'row', gap: space.sm }, summaryPrivacyIcon: { color: colors.accentPrimary, fontSize: 21 }, summaryPrivacyText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, flex: 1 }, summaryDocumentTitle: { ...type.title, color: colors.textPrimary, marginTop: space.md }, summarySourceMeta: { ...type.caption, color: colors.textSecondary, marginTop: 4 }, summaryLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.9, marginTop: space.md }, summaryOptions: { flexDirection: 'row', gap: space.xs }, summaryOption: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.small, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.64)', alignItems: 'center', justifyContent: 'center' }, summaryFormatOption: { minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.small, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.64)', alignItems: 'center', justifyContent: 'center' }, summaryOptionSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentPrimary }, summaryOptionText: { ...type.caption, color: colors.textSecondary, textTransform: 'capitalize' }, summaryOptionTextSelected: { color: colors.accentPrimary }, summaryGenerate: { minHeight: 56, marginTop: space.md, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.accentPrimary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, summaryGenerateText: { ...type.heading, color: '#FFFFFF' }, summaryGenerateArrow: { color: '#FFFFFF', fontSize: 28 }, summaryBusy: { minHeight: 100, marginTop: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, alignItems: 'center', justifyContent: 'center', gap: space.xs }, summaryBusyText: { ...type.caption, color: colors.textSecondary }, summaryCancel: { padding: space.xs }, summaryCancelText: { ...type.caption, color: colors.accentPrimary }, summaryResultHeader: { marginTop: space.lg, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm }, summaryResultTitle: { ...type.heading, color: colors.textPrimary }, summaryResultMeta: { ...type.caption, color: colors.textSecondary, marginTop: 3 }, summaryDelete: { ...type.caption, color: colors.error }, summaryOverview: { padding: space.md, marginTop: space.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceInset }, summaryBody: { ...type.body, color: colors.textPrimary, lineHeight: 22, marginTop: 5 }, summaryPoints: { gap: space.xs }, summaryPoint: { ...type.body, color: colors.textPrimary, lineHeight: 22 }, summaryTerm: { ...type.body, color: colors.textSecondary, lineHeight: 21, marginTop: 4 }, summaryTermName: { color: colors.textPrimary, fontWeight: '700' }, summarySection: { padding: space.md, marginTop: space.xs, borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle }, summarySectionHeading: { ...type.label, color: colors.accentPrimary }, summaryLimitations: { padding: space.md, marginTop: space.md, borderRadius: radius.medium, backgroundColor: colors.accentSoft }, summaryLimitation: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 4 }, summaryActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md }, summaryAction: { minHeight: 46, flex: 1, borderRadius: radius.small, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', borderBottomColor: 'rgba(0,0,0,0.64)', alignItems: 'center', justifyContent: 'center' }, summaryActionText: { ...type.label, color: colors.textPrimary },
  readerTools: { flexDirection: 'row', gap: space.sm }, readerTool: { flex: 1, minHeight: 50, paddingHorizontal: space.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, readerToolIcon: { color: colors.accentPrimary, fontSize: 20 }, readerToolText: { ...type.caption, color: colors.textSecondary }, bookmarkRow: { minHeight: 64, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', gap: space.sm }, bookmarkTitle: { ...type.body, color: colors.textPrimary }, bookmarkMeta: { ...type.caption, color: colors.textTertiary, marginTop: 3 },
  learningTabs: { paddingVertical: space.sm, gap: 6 }, learningTab: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle, justifyContent: 'center' }, learningTabSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentPrimary }, learningTabText: { ...type.caption, color: colors.textTertiary }, learningTabTextSelected: { color: colors.accentPrimary }, learningHint: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: space.xs }, learningResult: { marginTop: space.md, padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset }, learningExcerpt: { marginTop: space.sm, padding: space.sm, borderRadius: radius.small, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle }, learningExcerptTitle: { ...type.caption, color: colors.accentPrimary, letterSpacing: 0.4 }, learningExcerptText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 3 }, learningCard: { marginTop: space.sm, padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle }, learningCardDifficulty: { ...type.caption, color: colors.accentPrimary, letterSpacing: 0.7 }, learningCardQuestion: { ...type.label, color: colors.textPrimary, marginTop: 5 }, learningCardAnswer: { ...type.body, color: colors.textSecondary, marginTop: 5, lineHeight: 21 }, learningSection: { padding: space.md, marginTop: space.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceInset },
  adaptiveRow: { marginTop: space.md, padding: space.sm, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, flexDirection: 'row', alignItems: 'center' }, adaptiveReason: { ...type.caption, color: colors.textSecondary, marginTop: 2 }, adaptiveToggle: { ...type.label, color: colors.accentPrimary, letterSpacing: 0.8 },
  libraryFilters: { paddingHorizontal: space.xl, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }, libraryFilter: { minHeight: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center', justifyContent: 'center' }, libraryFilterSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentPrimary }, libraryFilterText: { ...type.caption, color: colors.textTertiary }, libraryFilterTextSelected: { color: colors.accentPrimary }, librarySorts: { paddingHorizontal: space.xl, paddingVertical: space.sm, flexDirection: 'row', gap: space.md }, librarySortText: { ...type.caption, color: colors.textTertiary }, librarySortSelected: { color: colors.accentPrimary }, favoriteMark: { color: colors.accentPrimary, fontSize: 19, marginRight: 2 },
  deleteText: { ...type.caption, color: colors.error }, textInput: { ...type.body, minHeight: 50, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary },
  ocrEditor: { flex: 1, minHeight: 260, marginTop: space.sm, padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary, ...type.body },
  playerScreenCompact: { paddingHorizontal: space.lg, paddingTop: space.xs }, playerScrollCompact: { marginTop: space.xs }, playerContentCompact: { paddingTop: space.xs, paddingBottom: space.xl, gap: space.sm }, playerArtworkCompact: { padding: space.md }, artworkMarkCompact: { width: 78, height: 78, marginTop: space.sm, shadowRadius: 18 }, artworkGlyphCompact: { fontSize: 34 }, progressAreaCompact: { marginBottom: space.sm }, scrubberSection: { marginTop: space.xs }, scrubberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingHorizontal: space.xs }, scrubberLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.85, fontSize: 10 }, scrubberContext: { ...type.caption, color: colors.textSecondary, flex: 1, textAlign: 'right' }, freePlayerIndicator: { minHeight: 52, marginBottom: space.sm, paddingHorizontal: space.sm, borderRadius: radius.medium, backgroundColor: 'rgba(216,180,90,0.10)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.28)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }, freePlayerIndicatorCritical: { backgroundColor: colors.accentSoft, borderColor: 'rgba(255,113,56,0.42)' }, freePlayerKicker: { ...type.caption, color: colors.recommendedGoldBright, letterSpacing: 0.8, fontSize: 10 }, freePlayerValue: { ...type.label, color: colors.textPrimary, marginTop: 2 }, freePlayerReset: { ...type.caption, color: colors.textSecondary, textAlign: 'right' }, mainControlsCompact: { gap: space.lg, marginBottom: 0 }, playerPlayButtonCompact: { width: 56, height: 56, shadowOffset: { width: 0, height: 5 }, shadowRadius: 12 }, quickControlsCompact: { marginBottom: space.sm }, quickControlCompact: { minHeight: 50 }, studioEntry: { minHeight: 68, marginBottom: space.sm, padding: space.sm, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.72)', flexDirection: 'row', alignItems: 'center', gap: space.sm }, studioEntryIcon: { width: 42, height: 42, borderRadius: radius.medium, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, studioEntryIconText: { color: colors.accentPrimary, fontSize: 23, fontWeight: '700' }, studioEntryTitle: { ...type.label, color: colors.textPrimary }, studioEntryText: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  playerControlDock: { alignSelf: 'stretch', paddingTop: 0, paddingHorizontal: space.sm, paddingBottom: space.sm, backgroundColor: colors.backgroundPrimary }, playerTransportHit: { alignItems: 'center', justifyContent: 'center' }, playerTransportSurface: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }, playerPlayActive: { shadowOpacity: 0.5, shadowRadius: 20 }, playerSkipButton: { borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', borderBottomColor: 'rgba(0,0,0,0.62)', ...shadows.raised }, playerSkipInner: { width: '80%', height: '80%', alignItems: 'center', justifyContent: 'center', borderRadius: radius.small, borderWidth: 1, borderColor: 'rgba(0,0,0,0.16)' }, playerSkipIcon: { ...type.heading, color: colors.textSecondary }, playerSkipPressed: { borderTopColor: 'rgba(255,113,56,0.18)', shadowOpacity: 0.22, elevation: 3 }, scrubberCurrentText: { ...type.caption, color: colors.textSecondary, flex: 1, marginLeft: space.sm, textAlign: 'left' },
  importInfoLink: { minHeight: 44, paddingHorizontal: space.xs, flexDirection: 'row', alignItems: 'center', gap: 6 }, importInfoIcon: { color: colors.accentPrimary, fontSize: 17 }, importInfoText: { ...type.label, color: colors.accentPrimary, flex: 1 }, importInfoChevron: { color: colors.accentPrimary, fontSize: 23 },
  importInfoModal: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.xl }, importInfoScroll: { paddingBottom: space.xxxl, gap: space.sm }, importInfoHero: { marginTop: space.sm, padding: space.md, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', borderBottomColor: 'rgba(0,0,0,0.66)', flexDirection: 'row', gap: space.sm, alignItems: 'center' }, importInfoHeroIcon: { width: 52, height: 52, borderRadius: radius.large, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, importInfoHeroGlyph: { color: colors.accentPrimary, fontSize: 28 }, importInfoHeroTitle: { ...type.heading, color: colors.textPrimary }, importInfoHeroText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 3 }, importInfoLabel: { ...type.caption, color: colors.textTertiary, letterSpacing: 0.9, marginTop: space.lg }, importInfoList: { borderRadius: radius.large, overflow: 'hidden', backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle }, importInfoRow: { minHeight: 68, padding: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.divider }, importInfoFormat: { minWidth: 62, minHeight: 32, paddingHorizontal: 6, borderRadius: radius.small, backgroundColor: colors.surfaceInset, alignItems: 'center', justifyContent: 'center' }, importInfoFormatText: { ...type.caption, color: colors.accentPrimary, fontWeight: '700', fontSize: 10, letterSpacing: 0.5 }, importInfoRowTitle: { ...type.label, color: colors.textPrimary }, importInfoRowDetail: { ...type.caption, color: colors.textSecondary, lineHeight: 17, marginTop: 2 }, importInfoCapacity: { ...type.caption, color: colors.textTertiary, lineHeight: 16, marginTop: 2 }, largeInfoCard: { marginTop: space.md, padding: space.md, borderRadius: radius.large, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }, largeInfoIcon: { width: 36, height: 36, borderRadius: radius.medium, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, largeInfoGlyph: { color: colors.accentPrimary, fontSize: 21 }, largeInfoTitle: { ...type.label, color: colors.textPrimary }, largeInfoText: { ...type.body, color: colors.textSecondary, lineHeight: 20, marginTop: 3 }, largeInfoNote: { ...type.caption, color: colors.textTertiary, lineHeight: 17, marginTop: 7 }, scannedInfo: { padding: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.borderSubtle }, scannedInfoTitle: { ...type.label, color: colors.textPrimary }, scannedInfoText: { ...type.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 3 }, importPrivacyNote: { ...type.caption, color: colors.textTertiary, lineHeight: 18, marginTop: space.sm, textAlign: 'center' },
  importCapacityHint: { minHeight: 30, marginTop: space.sm, paddingHorizontal: space.xs, borderLeftWidth: 2, borderLeftColor: 'rgba(255,113,56,0.30)', flexDirection: 'row', alignItems: 'center', gap: 6 }, importCapacityIcon: { color: colors.textTertiary, fontSize: 13 }, importCapacityText: { ...type.caption, color: colors.textTertiary, lineHeight: 17, flex: 1 },
  preparedErrorMark: { backgroundColor: colors.accentSoft }, preparedPreparingMark: { backgroundColor: colors.accentSoft }, preparedErrorKicker: { color: colors.textPrimary }, preparedProgressMeta: { alignSelf: 'stretch', marginTop: space.md }, preparedProgressLabel: { ...type.label, color: colors.textPrimary }, preparedProgressHint: { ...type.caption, color: colors.textSecondary, marginTop: 3 }, playNowDisabled: { opacity: 0.48 }, preparedRetry: { minHeight: 50, alignSelf: 'stretch', marginTop: space.md, borderRadius: radius.medium, backgroundColor: colors.surfaceInset, alignItems: 'center', justifyContent: 'center' }, preparedRetryText: { ...type.label, color: colors.accentPrimary },
});
