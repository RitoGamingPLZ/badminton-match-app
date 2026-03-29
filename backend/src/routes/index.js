/**
 * Express Router for Lambda URL matching and param extraction.
 * SSE is NOT registered here — it bypasses Express in handler.js.
 */

import { Router } from 'express';
import { handleCreateRoom, handleJoinRoom, handleGetRoom, handleStartSession, handleAddMatches } from './rooms.js';
import { handleMarkMatchDone, handleSkipMatch, handleEditMatch } from './matches.js';
import { handleUndoLastOperation } from './session.js';

export const router = Router();

router.post('/rooms',                  (req, res) => handleCreateRoom(req._event, res._stream));
router.get('/rooms/:code',             (req, res) => handleGetRoom(req.params.code, res._stream));
router.post('/rooms/:code/join',       (req, res) => handleJoinRoom(req.params.code, req._event, res._stream));
router.post('/rooms/:code/start',      (req, res) => handleStartSession(req.params.code, req._event, res._stream));
router.post('/rooms/:code/match/done', (req, res) => handleMarkMatchDone(req.params.code, req._event, res._stream));
router.post('/rooms/:code/match/skip', (req, res) => handleSkipMatch(req.params.code, req._event, res._stream));
router.patch('/rooms/:code/match',     (req, res) => handleEditMatch(req.params.code, req._event, res._stream));
router.post('/rooms/:code/undo',       (req, res) => handleUndoLastOperation(req.params.code, req._event, res._stream));
router.post('/rooms/:code/matches',    (req, res) => handleAddMatches(req.params.code, req._event, res._stream));
