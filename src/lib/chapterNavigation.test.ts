import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function runChapterNavigationFixtures() {
  const source = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8');
  if (!source.includes('Open chapters and bookmarks')) throw new Error('The reader needs an accessible chapter navigator action');
  if (!source.includes('styles.chapterRowActive')) throw new Error('The chapter list needs an active current-chapter state');
  if (!source.includes("suggested ? 'Suggested section' : 'Chapter'") || !source.includes('${index + 1}')) throw new Error('Chapter rows should be visibly numbered and distinguish suggestions');
  if (source.includes('chapterContextCard') || source.includes('CURRENT CHAPTER')) throw new Error('The player should not duplicate the chapter sheet with a second current-chapter action');
  const playerSource = source.slice(source.indexOf('function PlayerScreen'), source.indexOf('function PlayerTransportButton'));
  if (playerSource.includes("onOpenLearning('podcast')") || playerSource.includes("onOpenLearning('review')")) throw new Error('Learning actions should be grouped under the single Learning tools entry');
  if (!playerSource.includes('accessibilityLabel="Bookmark current sentence"')) throw new Error('The bookmark action needs an explicit accessible button target');
  const learningEntrySource = source.slice(source.indexOf('const openLearningTools = useCallback'), source.indexOf('const spokenPreview = useMemo'));
  if (learningEntrySource.includes('subscription.requirePro()')) throw new Error('Document-grounded learning tools must remain usable without a Pro entitlement');
  if (!learningEntrySource.includes('setShowLearningTools(true)')) throw new Error('Learning tools entry must open the learning sheet');
  const learningModalSource = source.slice(source.indexOf('function LearningToolsModal'), source.indexOf('function BookmarksModal'));
  for (const tab of ["'ask'", "'explain'", "'review'", "'academic'", "'compare'", "'podcast'"]) {
    if (!learningModalSource.includes(tab)) throw new Error(`Learning tab ${tab} is not wired into the learning sheet`);
  }
  for (const action of ['onAsk(draft)', 'onPress={onExplain}', 'onCreateCards', 'onCreatePodcast', 'onListen(section.text)', 'onListenConversation(podcast.turns)']) {
    if (!learningModalSource.includes(action)) throw new Error(`Learning action ${action} is missing its button handler`);
  }
  if (!source.includes('onPress={() => onJumpChapter(chapter)}') || !source.includes('onPress={() => onJump(bookmark)}')) throw new Error('Chapter and bookmark rows must have distinct jump handlers');
  if (!source.includes('Section unavailable')) throw new Error('Missing section targets should stay visible instead of silently closing the sheet');
  if (!source.includes('player.jumpToSection(sectionIndex)')) throw new Error('Inline chapter jumps should use the player’s canonical section seek path');
  const speechPlayerSource = readFileSync(resolve(process.cwd(), 'src/hooks/useSpeechPlayer.ts'), 'utf8');
  if (!speechPlayerSource.includes('source.indexOf(probe, cursor)') || !speechPlayerSource.includes('index <= sectionIndex')) throw new Error('Inline section seeks must resolve repeated headings in document order');
}

runChapterNavigationFixtures();
