import { navigationMarkersFromChapters, navigationMarkersFromSections, visibleNavigationMarkers } from './documentNavigation';

export function runDocumentNavigationFixtures() {
  const sections = [
    { id: 'one', title: 'Introduction', text: 'one '.repeat(100), order: 0 },
    { id: 'two', title: 'Practice', text: 'two '.repeat(300), order: 1 },
  ];
  const sectionMarkers = navigationMarkersFromSections(sections);
  if (sectionMarkers.length !== 2 || sectionMarkers[0].position !== 0 || sectionMarkers[1].position !== 0.25) throw new Error('Section markers must reflect their real relative offsets');
  if (navigationMarkersFromSections([{ id: 'only', title: 'Only heading', text: 'single section', order: 0 }]).length !== 0) throw new Error('A single section must not create a fabricated chapter marker');
  const chapters = navigationMarkersFromChapters([{ documentId: 'book', id: 'first', title: 'First', sequence: 0 }, { documentId: 'book', id: 'last', title: 'Last', sequence: 9 }], 10);
  if (chapters[1]?.position !== 1) throw new Error('Persisted chapter markers must use real chunk positions');
  if (visibleNavigationMarkers(Array.from({ length: 30 }, (_, index) => ({ id: String(index), title: String(index), position: index / 29 })), 10).length !== 10) throw new Error('Visible marker density must be bounded');
}
