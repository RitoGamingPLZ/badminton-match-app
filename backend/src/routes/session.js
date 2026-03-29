/**
 * Session control route handlers — parse request, delegate to SessionService, respond.
 */

import { sessionService } from '../services/index.js';
import { hostToken, logRequest } from './helpers.js';

export async function handleUndoLastOperation(req, res, next) {
  try {
    const result = await sessionService.undo(req.params.code, hostToken(req), req.body?.version);
    logRequest(req.method, req.path, 200);
    res.status(200).json(result);
  } catch (e) { next(e); }
}
