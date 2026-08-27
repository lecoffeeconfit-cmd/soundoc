export const HOME_IMPORT_LAYOUT = {
  minHeight: 72,
  height: 72,
  verticalPadding: 10,
  horizontalPadding: 16,
  gap: 12,
  iconSize: 40,
} as const;

export const HOME_HERO_LAYOUT = {
  topPadding: 12,
  brandBottomSpacing: 24,
  titleFontSize: 34,
  titleLineHeight: 40,
  continueDividerTopSpacing: 12,
  continueTitleTopSpacing: 8,
} as const;

export const QUICK_READ_GUIDE_STEPS = [
  { title: 'Open a webpage', detail: 'Use Safari, Chrome, or another browser.' },
  { title: 'Tap Share', detail: 'Choose the arrow-up-from-box button in your browser.' },
  { title: 'Choose Soundoc', detail: 'Soundoc prepares the page and adds it to your Library.' },
] as const;

export type HomeImportAction = {
  id: 'web' | 'quick-read' | 'documents' | 'text';
  symbol: string;
  title: string;
  description: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  primary?: boolean;
  isNew?: boolean;
  shareGlyph?: boolean;
};

type HomeImportBorderTreatment = {
  borderWidth: 1;
  borderColor: string;
  borderTopColor: string;
  borderBottomColor: string;
};

const NEUTRAL_HOME_IMPORT_BORDER: HomeImportBorderTreatment = {
  borderWidth: 1,
  borderColor: 'rgba(154,160,168,0.14)',
  borderTopColor: 'rgba(177,183,191,0.16)',
  borderBottomColor: 'rgba(111,118,126,0.12)',
};

const SHARE_HOME_IMPORT_BORDER: HomeImportBorderTreatment = {
  borderWidth: 1,
  borderColor: 'rgba(255,113,56,0.16)',
  borderTopColor: 'rgba(255,166,120,0.18)',
  borderBottomColor: 'rgba(255,113,56,0.12)',
};

export function getHomeImportBorderTreatment(action: Pick<HomeImportAction, 'primary' | 'shareGlyph'>): HomeImportBorderTreatment | undefined {
  if (action.primary) return undefined;
  return action.shareGlyph ? SHARE_HOME_IMPORT_BORDER : NEUTRAL_HOME_IMPORT_BORDER;
}

type HomeImportHandlers = {
  openWeb: () => void;
  openQuickRead: () => void;
  openDocuments: () => void;
  openText: () => void;
};

export function createHomeImportActions(handlers: HomeImportHandlers): readonly HomeImportAction[] {
  return [
    {
      id: 'web',
      symbol: '↗',
      title: 'Web Article or Link',
      description: 'Articles & direct document links',
      onPress: handlers.openWeb,
      accessibilityLabel: 'Import a web article or link',
      accessibilityHint: 'Opens the existing link import flow',
      primary: true,
    },
    {
      id: 'quick-read',
      symbol: '↑',
      title: 'Share to Soundoc',
      description: 'Send pages from Safari, Chrome & more',
      onPress: handlers.openQuickRead,
      accessibilityLabel: 'Learn how to share webpages to Soundoc',
      accessibilityHint: 'Explains how to send a webpage to Soundoc from another app',
      isNew: true,
      shareGlyph: true,
    },
    {
      id: 'documents',
      symbol: '⌁',
      title: 'PDF & Documents',
      description: 'Books, textbooks & large documents',
      onPress: handlers.openDocuments,
      accessibilityLabel: 'Import PDF and documents',
      accessibilityHint: 'Opens the existing document picker',
    },
    {
      id: 'text',
      symbol: 'T',
      title: 'Paste Text',
      description: 'Long manuscripts welcome',
      onPress: handlers.openText,
      accessibilityLabel: 'Paste text',
      accessibilityHint: 'Opens the existing Paste Text flow',
    },
  ];
}
