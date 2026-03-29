/**
 * Session control route handlers.
 */

import { sessionService } from '../services/index.js';
import { hostToken, wrapRoute } from './helpers.js';

export const undoLastOperation = wrapRoute(req =>
  sessionService.undo(req.params.code, hostToken(req), req.body?.version)
);
