/**
 * Repository factory.
 *
 * Reads DB_DRIVER from the environment and returns the appropriate
 * repository singleton.  All repositories expose the same interface:
 *
 *   getRoom(code)
 *   createRoom(room)
 *   saveState(code, patch, expectedVersion)
 *   addPlayer(code, player, expectedVersion)
 *   startSession(code, matches, expectedVersion)
 *   appendMatches(code, newMatches, expectedVersion)
 *
 * Version-conflict errors are normalised to VersionConflictError regardless
 * of which driver is in use.
 *
 * Supported drivers (DB_DRIVER env var):
 *   mongodb  — MongoDB (default; docker-compose / Cloud Run / self-hosted)
 *   memory   — In-process Map (tests / zero-dependency local runs)
 */

import { MongoRepository }    from './MongoRepository.js';
import { InMemoryRepository } from './InMemoryRepository.js';

let _repo = null;

export function getRepository() {
  if (_repo) return _repo;

  const driver = (process.env.DB_DRIVER || 'mongodb').toLowerCase();

  switch (driver) {
    case 'memory':
      _repo = new InMemoryRepository();
      break;

    default: // 'mongodb'
      _repo = new MongoRepository(
        process.env.MONGO_URI || 'mongodb://localhost:27017',
        process.env.MONGO_DB  || 'badminton',
      );
      break;
  }

  console.info(`[db] using driver: ${driver}`);
  return _repo;
}

export { VersionConflictError } from './errors.js';
