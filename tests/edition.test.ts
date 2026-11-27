import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, loadCharacter } from '../src/player/characters/catalog.ts';
import { BOARD_STYLES, loadBoardStyle } from '../src/boards.ts';

test('public selectors expose the shipping roster', () => {
  assert.deepEqual(CHARACTERS.map(rider => rider.id), ['boy', 'girl']);
  assert.deepEqual(BOARD_STYLES.map(board => board.id), ['classic', 'neon', 'sakura', 'alpine', 'midnight']);
});

test('opening a save from another edition preserves its unavailable selections', () => {
  const storage = { getItem: () => 'other-edition', setItem: () => assert.fail('selection overwritten') };
  assert.equal(loadCharacter(storage), 'boy');
  assert.equal(loadBoardStyle(storage), 'classic');
});
