/**
 * Singleton service instances — imported by route handlers.
 *
 * All three services share the same repository instance so they
 * operate on a single consistent DB connection.
 */

import { getRepository } from '../db/index.js';
import { RoomService }    from './RoomService.js';
import { MatchService }   from './MatchService.js';
import { SessionService } from './SessionService.js';

const db = getRepository();

export const roomService    = new RoomService(db);
export const matchService   = new MatchService(db);
export const sessionService = new SessionService(db);
