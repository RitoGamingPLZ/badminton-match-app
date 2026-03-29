/**
 * Shared patch helper for repository saveState methods.
 *
 * Enumerates the mutable room fields so both InMemoryRepository and
 * MongoRepository build their update objects from a single source of truth.
 */

const PATCH_FIELDS = [
  'matches',
  'players',
  'currentMatchIndex',
  'undoStack',
  'operationLog',
  'unavailablePlayers',
];

/**
 * Copy only the defined patch fields onto target.
 * Used by InMemoryRepository to build the update object.
 */
export function applyPatch(target, patch) {
  for (const f of PATCH_FIELDS) {
    if (patch[f] !== undefined) target[f] = patch[f];
  }
}

/**
 * Build a $set projection from a patch.
 * Used by MongoRepository to build the MongoDB update object.
 */
export function patchToSet(patch) {
  const set = {};
  for (const f of PATCH_FIELDS) {
    if (patch[f] !== undefined) set[f] = patch[f];
  }
  return set;
}
