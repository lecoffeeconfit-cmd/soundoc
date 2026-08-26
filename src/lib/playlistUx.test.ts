import assert from 'node:assert/strict';
// @ts-ignore Node's strip-types runner resolves the explicit TypeScript extension.
import { filterPlaylistItems, movePlaylistItem, normalizePlaylistName, playlistSelectionSummary, removeItemFromPlaylists, togglePlaylistItem } from './playlistUx.ts';

type TestItem = { id: string; title: string; seconds: number };

const items: TestItem[] = [
  { id: 'one', title: 'Morning pages', seconds: 120 },
  { id: 'two', title: 'The quiet craft', seconds: 240 },
  { id: 'three', title: 'Night notes', seconds: 360 },
];

assert.equal(normalizePlaylistName('  Deep work  '), 'Deep work');
assert.equal(normalizePlaylistName('   '), null);
assert.deepEqual(togglePlaylistItem(['one'], 'two'), ['one', 'two']);
assert.deepEqual(togglePlaylistItem(['one', 'two'], 'one'), ['two']);
assert.deepEqual(movePlaylistItem(['one', 'two', 'three'], 2, -1), ['one', 'three', 'two']);
assert.deepEqual(movePlaylistItem(['one', 'two', 'three'], 0, -1), ['one', 'two', 'three']);
assert.deepEqual(filterPlaylistItems(items, 'QUIET'), [items[1]]);
assert.deepEqual(playlistSelectionSummary(['one', 'three'], items, (item) => item.seconds), { count: 2, seconds: 480 });
assert.deepEqual(removeItemFromPlaylists([{ id: 'focus', itemIds: ['one', 'two'] }, { id: 'night', itemIds: ['three'] }], 'one'), [{ id: 'focus', itemIds: ['two'] }, { id: 'night', itemIds: ['three'] }]);

console.log('playlist UX tests passed');
