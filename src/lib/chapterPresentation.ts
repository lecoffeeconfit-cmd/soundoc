import type { SoundocSection } from '../types';
import { isSuggestedSection } from './sectionIntelligence';

export function formatChapterSummary(sections?: SoundocSection[]) {
  const count = sections?.length ?? 0;
  const suggested = sections?.filter(isSuggestedSection).length ?? 0;
  if (count > 1 && suggested === count) return `${count} suggested sections`;
  return count > 1 ? `${count} chapters detected` : '1 reading section';
}
