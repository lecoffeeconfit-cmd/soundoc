export type ItemType = 'text' | 'article' | 'document';

export type LibraryItem = {
  id: string;
  type: ItemType;
  title: string;
  source?: string;
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
};

export type Voice = { identifier: string; name: string; language: string; quality?: string };

export type PlayerState = 'idle' | 'ready' | 'playing' | 'paused' | 'completed' | 'error';
