/**
 * Room lifecycle route handlers — parse request, delegate to RoomService, respond.
 */

import { roomService } from '../services/index.js';
import { hostToken, logRequest } from './helpers.js';

export async function handleCreateRoom(req, res, next) {
  try {
    const { playerName, additionalPlayers = [] } = req.body || {};
    const result = await roomService.createRoom({ playerName, additionalPlayers });
    logRequest(req.method, req.path, 201);
    res.status(201).json(result);
  } catch (e) { next(e); }
}

export async function handleJoinRoom(req, res, next) {
  try {
    const result = await roomService.joinRoom(req.params.code, req.body?.playerName);
    logRequest(req.method, req.path, 200);
    res.status(200).json(result);
  } catch (e) { next(e); }
}

export async function handleGetRoom(req, res, next) {
  try {
    const result = await roomService.getRoom(req.params.code);
    res.status(200).json(result);
  } catch (e) { next(e); }
}

export async function handleStartSession(req, res, next) {
  try {
    const result = await roomService.startSession(
      req.params.code, hostToken(req), req.body?.version
    );
    logRequest(req.method, req.path, 200);
    res.status(200).json(result);
  } catch (e) { next(e); }
}

export async function handleAddMatches(req, res, next) {
  try {
    const result = await roomService.addMatches(
      req.params.code, hostToken(req), req.body?.count, req.body?.version
    );
    logRequest(req.method, req.path, 200);
    res.status(200).json(result);
  } catch (e) { next(e); }
}
