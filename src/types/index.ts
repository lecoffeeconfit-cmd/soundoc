export type ItemType = 'text' | 'article' | 'document';
export type SoundocSourceType = 'url' | 'text' | 'pdf' | 'docx' | 'epub' | 'html' | 'image' | 'scan' | 'shared';
export type SoundocSection = { id: string; title?: string; level?: number; text: string; order: number; sourceAnchor?: string };
export type SoundocDocument = { id: string; title: string; author?: string; sourceUrl?: string; sourceDomain?: string; sourceType: SoundocSourceType; originalText?: string; cleanedText: string; speakableText?: string; sections: SoundocSection[]; wordCount: number; language?: string; extractionMethod: string; extractionConfidence: number; extractionWarnings: string[]; createdAt: string; updatedAt: string; lastOpenedAt?: string; completedAt?: string };
export type SummaryProviderType = 'apple-foundation-model' | 'android-mlkit' | 'local-extractive';
export type SummaryLength = 'brief' | 'standard' | 'detailed';
export type SummaryFormat = 'overview' | 'key-points' | 'section-summary' | 'study-notes' | 'research-summary';
export type SummaryAvailability = { available: boolean; provider: SummaryProviderType; reason?: string; languages?: string[] };
export type SummaryRequest = { documentId: string; title?: string; language?: string; text: string; sections?: SoundocSection[]; length: SummaryLength; format: SummaryFormat };
export type SummaryResult = { provider: SummaryProviderType; isGenerative: boolean; title?: string; overview: string; keyPoints: string[]; importantTerms?: Array<{ term: string; explanation: string }>; sectionSummaries?: Array<{ sectionId?: string; heading: string; summary: string }>; limitations: string[]; generatedAt: string; sourceWordCount: number; contentHash: string; format: SummaryFormat; length: SummaryLength };

export type IntelligenceProvider = SummaryProviderType;
export type SourcePassage = { sectionId: string; sectionTitle: string; text: string; startOffset: number; endOffset: number };
export type GroundedAnswer = { answer: string; provider: IntelligenceProvider; isGenerative: boolean; found: boolean; passages: SourcePassage[]; limitations: string[]; generatedAt: string };
export type PassageExplanation = { simple: string; shorter: string; terms: Array<{ term: string; definition: string }>; provider: IntelligenceProvider; isGenerative: boolean; uncertainty?: string; source: SourcePassage; limitations: string[] };
export type Flashcard = { id: string; question: string; answer: string; sectionId: string; sectionTitle: string; sourceExcerpt: string; difficulty: 'easy' | 'medium' | 'hard'; createdAt: string };
export type ReviewQuestion = { id: string; type: 'multiple-choice' | 'true-false' | 'short-answer' | 'recall'; question: string; answer: string; choices?: string[]; sectionId: string; sourceExcerpt: string; provider: IntelligenceProvider; isGenerative: boolean };
export type AdaptiveListeningChange = { rate: number; sentencePauseMs: number; paragraphPauseMs: number; reason: string; appliedAt: string };
export type PodcastScript = { title: string; turns: Array<{ speaker: 'Host' | 'Guest'; text: string; sectionId?: string }>; provider: IntelligenceProvider; isGenerative: boolean; limitations: string[]; generatedAt: string };
export type ListeningAnalytics = { minutesListened: number; wordsListened: number; documentsCompleted: number; summaryMinutes: number; averageSpeed: number; timeSavedSeconds: number; mostUsedMode?: string; weeklyGoalMinutes: number; streakDays: number; updatedAt: string };

export type LibraryItem = {
  id: string;
  type: ItemType;
  title: string;
  source?: string;
  sourceUrl?: string;
  text: string;
  language: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  sentenceIndex: number;
  progress: number;
  selectedVoice?: string;
  rate: number;
  pitch: number;
  completed: boolean;
  author?: string;
  sourceType?: SoundocSourceType;
  originalText?: string;
  cleanedText?: string;
  speakableText?: string;
  sections?: SoundocSection[];
  extractionMethod?: string;
  extractionConfidence?: number;
  extractionWarnings?: string[];
  lastOpenedAt?: number;
  completedAt?: number;
  currentSectionId?: string;
  currentParagraphIndex?: number;
  currentCharacterOffset?: number;
  queuePosition?: number;
  favorite?: boolean;
  folderId?: string;
  tags?: string[];
  sourceUri?: string;
  selectedModeId?: ListeningModeId;
};

export type Bookmark = { id: string; libraryItemId: string; sectionId?: string; paragraphIndex?: number; sentenceIndex: number; label?: string; note?: string; createdAt: number; updatedAt: number };
export type Highlight = { id: string; libraryItemId: string; sectionId?: string; startOffset: number; endOffset: number; text: string; note?: string; createdAt: number; updatedAt: number };
export type Folder = { id: string; name: string; createdAt: number; updatedAt: number };

export type Voice = { identifier: string; name: string; language: string; quality?: string };

export type ListeningModeId = 'smart' | 'natural' | 'storyteller' | 'deepNarrator' | 'newsreader' | 'studyFocus' | 'fastScan' | 'slowClear' | 'relaxed' | 'sleepReading' | 'highClarity' | 'custom';
export type SmartClassification = 'scientific' | 'technical' | 'educational' | 'news' | 'story' | 'legal' | 'general' | 'shortForm';

export type PronunciationRule = {
  id: string;
  original: string;
  replacement: string;
  enabled: boolean;
  caseSensitive: boolean;
};

export type SpeechPreferences = {
  presetId: string;
  modeId: ListeningModeId;
  smartClassification?: SmartClassification;
  voiceIdentifier?: string;
  voiceName?: string;
  voiceLocale?: string;
  rate: number;
  pitch: number;
  volume: number;
  sentencePauseMs: number;
  paragraphPauseMs: number;
  pronunciationRules: PronunciationRule[];
  skipHeadings: boolean;
  skipUrls: boolean;
  skipCitations: boolean;
  skipConsecutiveDuplicates: boolean;
  favoriteVoiceIds: string[];
  recentVoiceIds: string[];
  adaptiveListeningEnabled?: boolean;
  skipLongNumbersAndCodes?: boolean;
};

export type Playlist = { id: string; name: string; createdAt: number; updatedAt: number; itemIds: string[] };

export type PlayerState = 'idle' | 'ready' | 'playing' | 'paused' | 'completed' | 'error';
