/**
 * Room lifecycle route handlers.
 */

import { roomService } from '../services/index.js';
import { hostToken, wrapRoute } from './helpers.js';

export const createRoom = wrapRoute(async req => {
  const { playerName, additionalPlayers = [] } = req.body || {};
  return roomService.createRoom({ playerName, additionalPlayers });
}, 201);

export const joinRoom = wrapRoute(req =>
  roomService.joinRoom(req.params.code, req.body?.playerName)
);

export const getRoom = wrapRoute(req =>
  roomService.getRoom(req.params.code)
);

export const startSession = wrapRoute(req =>
  roomService.startSession(req.params.code, hostToken(req), req.body?.version)
);

export const addMatches = wrapRoute(req =>
  roomService.addMatches(req.params.code, hostToken(req), req.body?.count, req.body?.version)
);
