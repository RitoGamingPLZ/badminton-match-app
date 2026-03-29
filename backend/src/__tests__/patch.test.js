import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, patchToSet } from '../db/patch.js';

describe('applyPatch', () => {
  test('copies defined patch fields onto target', () => {
    const target = {};
    applyPatch(target, { matches: [1, 2], players: [{ name: 'A' }] });
    assert.deepEqual(target.matches, [1, 2]);
    assert.deepEqual(target.players, [{ name: 'A' }]);
  });

  test('ignores fields not in PATCH_FIELDS', () => {
    const target = {};
    applyPatch(target, { code: '1234', hostToken: 'x' });
    assert.equal(target.code, undefined);
    assert.equal(target.hostToken, undefined);
  });

  test('skips undefined patch values', () => {
    const target = { matches: [1] };
    applyPatch(target, { matches: undefined, currentMatchIndex: 5 });
    assert.deepEqual(target.matches, [1]); // unchanged
    assert.equal(target.currentMatchIndex, 5);
  });

  test('copies all six recognised patch fields', () => {
    const target = {};
    const patch = {
      matches: [], players: [], currentMatchIndex: 0,
      undoStack: [], operationLog: [], unavailablePlayers: [],
    };
    applyPatch(target, patch);
    for (const key of Object.keys(patch)) {
      assert.ok(key in target, `${key} should be copied`);
    }
  });
});

describe('patchToSet', () => {
  test('returns object with only defined patch fields', () => {
    const set = patchToSet({ matches: [1], currentMatchIndex: 3 });
    assert.deepEqual(set.matches, [1]);
    assert.equal(set.currentMatchIndex, 3);
  });

  test('excludes undefined fields', () => {
    const set = patchToSet({ matches: undefined, currentMatchIndex: 2 });
    assert.equal(set.matches, undefined);
    assert.equal(set.currentMatchIndex, 2);
  });

  test('ignores non-patch fields', () => {
    const set = patchToSet({ code: '1234', matches: [] });
    assert.equal(set.code, undefined);
    assert.deepEqual(set.matches, []);
  });
});
