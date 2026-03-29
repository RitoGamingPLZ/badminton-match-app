/**
 * Express router — registers all API routes.
 */

import { Router } from 'express';
import { handleCreateRoom, handleJoinRoom, handleGetRoom, handleStartSession, handleAddMatches } from './rooms.js';
import { handleMarkMatchDone, handleSkipMatch, handleEditMatch } from './matches.js';
import { handleUndoLastOperation } from './session.js';
import { handleSSE } from './sse.js';

export const router = Router();

router.post('/rooms',                  handleCreateRoom);
router.get('/rooms/:code',             handleGetRoom);
router.get('/rooms/:code/events',      handleSSE);
router.post('/rooms/:code/join',       handleJoinRoom);
router.post('/rooms/:code/start',      handleStartSession);
router.post('/rooms/:code/match/done', handleMarkMatchDone);
router.post('/rooms/:code/match/skip', handleSkipMatch);
router.patch('/rooms/:code/match',     handleEditMatch);
router.post('/rooms/:code/undo',       handleUndoLastOperation);
router.post('/rooms/:code/matches',    handleAddMatches);
