/**
 * Single Lambda handler for all routes — REST + SSE.
 *
 * Uses Lambda Response Streaming (awslambda.streamifyResponse) so that
 * SSE connections can stay open for up to 15 minutes without hitting the
 * 29-second API Gateway limit.  Non-SSE routes write once and end immediately.
 *
 * Routing uses an express.Router for URL pattern matching and param extraction.
 * SSE is handled before Express to preserve Lambda Response Streaming.
 *
 * Routes
 * ──────
 * POST   /rooms                      → createRoom
 * POST   /rooms/:code/join           → joinRoom
 * GET    /rooms/:code                → getRoom
 * POST   /rooms/:code/start          → startSession
 * PATCH  /rooms/:code/match          → editMatch   (Command: EditMatchCommand)
 * POST   /rooms/:code/match/done     → markMatchDone (Command: MatchDoneCommand)
 * POST   /rooms/:code/match/skip     → skipMatch   (Command: SkipMatchCommand)
 * POST   /rooms/:code/undo           → undoLastOperation
 * POST   /rooms/:code/matches        → addMatches
 * GET    /rooms/:code/events         → SSE stream
 * OPTIONS *                          → CORS preflight
 */

import { randomUUID } from 'crypto';
import { Router } from 'express';
import { getRepository, VersionConflictError } from './db/index.js';
import { generateMatches, calculateInitialRounds } from './matchGen.js';
import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from './commands/index.js';
import { safeRoom, pushUndo, pushLog, makeSnapshot, corsHeaders } from './helpers.js';

const db = getRepository();

// ── Local-dev shim ────────────────────────────────────────────────────────────
if (typeof awslambda === 'undefined') {
  console.warn('[shim] awslambda not found — using no-op shim (SSE will not stream)');
  globalThis.awslambda = {
    streamifyResponse: (fn) => fn,
    HttpResponseStream: { from(stream) { return stream; } },
  };
}

// ── Response helpers ──────────────────────────────────────────────────────────

function jsonResponse(stream, statusCode, body) {
  // eslint-disable-next-line no-undef
  const s = awslambda.HttpResponseStream.from(stream, {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
  s.write(JSON.stringify(body));
  s.end();
}

function err(stream, statusCode, message) {
  jsonResponse(stream, statusCode, { error: message });
}

function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return {}; }
}

function hostToken(event) {
  return event.headers?.['x-host-token'] || parseBody(event).hostToken || '';
}

// ── Command executor ──────────────────────────────────────────────────────────

async function runCommand(code, command, room, expectedVersion, stream) {
  const snapshot     = makeSnapshot(room);
  const { patch, logEntry } = command.execute(room);
  const undoStack    = pushUndo(room, snapshot);
  const operationLog = pushLog(room, logEntry);

  try {
    const updated = await db.saveState(
      code,
      { ...patch, undoStack, operationLog },
      expectedVersion,
    );
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return err(stream, 409, 'Version conflict — reload and retry');
    }
    throw e;
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleCreateRoom(event, stream) {
  const { playerName, additionalPlayers = [] } = parseBody(event);
  if (!playerName?.trim()) return err(stream, 400, 'playerName is required');

  const seen    = new Set([playerName.trim().toLowerCase()]);
  const players = [{ name: playerName.trim(), gamesPlayed: 0 }];
  for (const n of additionalPlayers) {
    const trimmed = n?.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    players.push({ name: trimmed, gamesPlayed: 0 });
  }

  let code, attempts = 0;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
    if (++attempts > 20) return err(stream, 503, 'Could not generate unique room code');
  } while (await db.getRoom(code));

  const token = randomUUID();
  const room  = await db.createRoom({
    code, hostToken: token, format: 'doubles', started: false,
    players, matches: [], currentMatchIndex: 0,
    undoStack: [], operationLog: [], unavailablePlayers: [],
  });

  jsonResponse(stream, 201, { hostToken: token, room: safeRoom(room) });
}

async function handleJoinRoom(code, event, stream) {
  const { playerName } = parseBody(event);
  if (!playerName?.trim()) return err(stream, 400, 'playerName is required');

  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.started) return err(stream, 409, 'Session already started');

  const nameTaken = room.players.some(
    p => p.name.toLowerCase() === playerName.trim().toLowerCase()
  );
  if (nameTaken) return err(stream, 409, 'Name already taken in this room');

  const updated = await db.addPlayer(code, { name: playerName.trim(), gamesPlayed: 0 }, room.version);
  jsonResponse(stream, 200, { room: safeRoom(updated) });
}

async function handleGetRoom(code, stream) {
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  jsonResponse(stream, 200, { room: safeRoom(room) });
}

async function handleStartSession(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (room.started) return err(stream, 409, 'Session already started');

  const { players } = room;
  if (players.length < 4) return err(stream, 400, 'Need at least 4 players for doubles');

  const matches = generateMatches(players, calculateInitialRounds(players.length), 1);
  if (matches.length) matches[0].status = 'active';

  try {
    const updated = await db.startSession(code, matches, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

async function handleMarkMatchDone(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const { winner, version: expectedVersion = room.version } = body;
  if (winner !== 1 && winner !== 2) return err(stream, 400, 'winner must be 1 or 2');

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return err(stream, 409, 'No active match');

  return runCommand(code, new MatchDoneCommand(winner), room, expectedVersion, stream);
}

async function handleSkipMatch(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const { playerName, version } = body;
  if (!playerName?.trim()) return err(stream, 400, 'playerName is required');

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return err(stream, 409, 'No active match');

  const allPlayers = new Set([...match.team1, ...match.team2]);
  if (!allPlayers.has(playerName)) return err(stream, 400, `${playerName} is not in the current match`);

  return runCommand(code, new SkipMatchCommand(playerName), room, version ?? room.version, stream);
}

async function handleEditMatch(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const { team1, team2, version: expectedVersion = room.version } = body;
  const matchIndex = body.matchIndex ?? room.currentMatchIndex;

  const match = room.matches[matchIndex];
  if (!match) return err(stream, 400, `Match index ${matchIndex} does not exist`);
  if (match.status === 'done' || match.status === 'skipped') {
    return err(stream, 409, 'Cannot edit a completed or skipped match');
  }

  if (!Array.isArray(team1) || team1.length !== 2) return err(stream, 400, 'team1 must have 2 players');
  if (!Array.isArray(team2) || team2.length !== 2) return err(stream, 400, 'team2 must have 2 players');

  const allNames = new Set(room.players.map(p => p.name));
  const submitted = [...team1, ...team2];
  for (const name of submitted) {
    if (!allNames.has(name)) return err(stream, 400, `Unknown player: ${name}`);
  }
  if (new Set(submitted).size !== submitted.length) return err(stream, 400, 'Duplicate players in teams');

  return runCommand(code, new EditMatchCommand(matchIndex, team1, team2), room, expectedVersion, stream);
}

async function handleUndoLastOperation(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const undoStack = room.undoStack || [];
  if (!undoStack.length) return err(stream, 409, 'Nothing to undo');

  const snapshot     = undoStack[undoStack.length - 1];
  const newUndoStack = undoStack.slice(0, -1);
  const operationLog = (room.operationLog || []).slice(0, -1);

  try {
    const updated = await db.saveState(code, {
      matches:             snapshot.matches,
      players:             snapshot.players,
      currentMatchIndex:   snapshot.currentMatchIndex,
      unavailablePlayers:  snapshot.unavailablePlayers ?? [],
      undoStack:           newUndoStack,
      operationLog,
    }, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

async function handleAddMatches(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');

  const count      = Math.min(body.count || 5, 20);
  const startId    = room.matches.length + 1;
  const newMatches = generateMatches(room.players, count, startId);

  try {
    const updated = await db.appendMatches(code, newMatches, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

// ── SSE handler ───────────────────────────────────────────────────────────────

const SSE_MAX_MS  = 10 * 60 * 1000;
const SSE_POLL_MS = 2000;
const SSE_PING_MS = 30 * 1000;

async function handleSSE(code, event, responseStream) {
  let clientVersion = parseInt(event.queryStringParameters?.version ?? '0', 10);

  // eslint-disable-next-line no-undef
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      ...corsHeaders,
    },
  });

  const write = data => { try { stream.write(data); } catch { /* client disconnected */ } };
  write(`: connected to room ${code}\n\n`);

  const startTime = Date.now();
  let lastPing    = startTime;

  try {
    while (Date.now() - startTime < SSE_MAX_MS) {
      const room = await db.getRoom(code);
      if (!room) { write('event: error\ndata: {"message":"Room not found"}\n\n'); break; }

      if (room.version > clientVersion) {
        clientVersion = room.version;
        write(`data: ${JSON.stringify(safeRoom(room))}\n\n`);
      }

      const now = Date.now();
      if (now - lastPing >= SSE_PING_MS) { write(': ping\n\n'); lastPing = now; }

      await new Promise(resolve => setTimeout(resolve, SSE_POLL_MS));
    }
  } catch (error) {
    write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
  }

  write('event: close\ndata: {}\n\n');
  stream.end();
}

// ── Express Router (URL matching + param extraction for Lambda) ───────────────

const router = Router();

router.post('/rooms',                  (req, res) => handleCreateRoom(req._event, res._stream));
router.get('/rooms/:code',             (req, res) => handleGetRoom(req.params.code, res._stream));
router.post('/rooms/:code/join',       (req, res) => handleJoinRoom(req.params.code, req._event, res._stream));
router.post('/rooms/:code/start',      (req, res) => handleStartSession(req.params.code, req._event, res._stream));
router.post('/rooms/:code/match/done', (req, res) => handleMarkMatchDone(req.params.code, req._event, res._stream));
router.post('/rooms/:code/match/skip', (req, res) => handleSkipMatch(req.params.code, req._event, res._stream));
router.post('/rooms/:code/undo',       (req, res) => handleUndoLastOperation(req.params.code, req._event, res._stream));
router.patch('/rooms/:code/match',     (req, res) => handleEditMatch(req.params.code, req._event, res._stream));
router.post('/rooms/:code/matches',    (req, res) => handleAddMatches(req.params.code, req._event, res._stream));

function dispatchViaRouter(event, responseStream) {
  return new Promise((resolve) => {
    const method = (event.requestContext?.http?.method ?? event.httpMethod ?? 'GET').toUpperCase();
    const url    = event.rawPath ?? event.path ?? '/';

    const req = { method, url, _event: event };
    const res = { _stream: responseStream };

    router(req, res, () => {
      err(responseStream, 404, 'Not found');
      resolve();
    });
  });
}

// ── Main router ───────────────────────────────────────────────────────────────

// eslint-disable-next-line no-undef
export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const method  = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
  const rawPath = event.rawPath ?? event.path ?? '/';

  if (method === 'OPTIONS') {
    // eslint-disable-next-line no-undef
    const s = awslambda.HttpResponseStream.from(responseStream, { statusCode: 204, headers: corsHeaders });
    s.end();
    return;
  }

  // SSE must bypass Express — needs raw Lambda stream for long-lived streaming
  const parts = rawPath.split('/').filter(Boolean);
  if (method === 'GET' && parts[2] === 'events') {
    return await handleSSE(parts[1], event, responseStream);
  }

  try {
    await dispatchViaRouter(event, responseStream);
  } catch (error) {
    console.error('Unhandled error:', error);
    err(responseStream, 500, 'Internal server error');
  }
});
