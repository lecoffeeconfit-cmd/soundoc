import { countWords } from './text';
import type { DocumentChapter, SoundocSection } from '../types';

export type NavigationMarker = { id: string; title: string; position: number };

function clampPosition(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** Uses existing section metadata only; it deliberately does not infer new headings for navigation. */
export function navigationMarkersFromSections(sections: SoundocSection[] | undefined): NavigationMarker[] {
  const structured = (sections ?? []).filter((section) => Boolean(section.title?.trim()) && countWords(section.text) > 0);
  if (structured.length < 2) return [];
  const totalWeight = structured.reduce((total, section) => total + Math.max(1, countWords(section.text)), 0);
  let consumed = 0;
  return structured.map((section) => {
    const marker = { id: section.id, title: section.title!.trim(), position: clampPosition(consumed / totalWeight) };
    consumed += Math.max(1, countWords(section.text));
    return marker;
  });
}

/** Chunk chapter rows are persisted by Soundoc's existing long-document pipeline. */
export function navigationMarkersFromChapters(chapters: DocumentChapter[], availableChunkCount: number): NavigationMarker[] {
  if (chapters.length < 2 || availableChunkCount < 2) return [];
  const lastChunk = Math.max(1, availableChunkCount - 1);
  return chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, position: clampPosition(chapter.sequence / lastChunk) }));
}

/** Keep the dial legible while retaining the full marker list for Jump To. */
export function visibleNavigationMarkers(markers: NavigationMarker[], maximum = 16): NavigationMarker[] {
  if (markers.length <= maximum) return markers;
  const result: NavigationMarker[] = [];
  for (let index = 0; index < maximum; index += 1) result.push(markers[Math.round(index * (markers.length - 1) / Math.max(1, maximum - 1))]);
  return result.filter((marker, index, all) => index === 0 || marker.id !== all[index - 1].id);
}

export function markerAtPosition(markers: NavigationMarker[], position: number) {
  return markers.reduce<NavigationMarker | undefined>((current, marker) => marker.position <= position ? marker : current, undefined);
}
