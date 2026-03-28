/**
 * Single Lambda handler for all routes — REST + SSE.
 *
 * Uses Lambda Response Streaming (awslambda.streamifyResponse) so that
 * SSE connections can stay open for up to 15 minutes without hitting the
 * 29-second API Gateway limit.  Non-SSE routes write once and end immediately.
 *
 * Routes
 * ──────
 * POST   /rooms                      → createRoom
 * POST   /rooms/:code/join           → joinRoom
 * GET    /rooms/:code                → getRoom
 * PATCH  /rooms/:code/format         → setFormat
 * POST   /rooms/:code/start          → startSession
 * PATCH  /rooms/:code/match          → editMatch   (Command: EditMatchCommand)
 * POST   /rooms/:code/match/done     → markMatchDone (Command: MatchDoneCommand)
 * POST   /rooms/:code/match/skip     → skipMatch   (Command: SkipMatchCommand)
 * POST   /rooms/:code/undo           → undoLastOperation
 * POST   /rooms/:code/matches        → addMatches
 * GET    /rooms/:code/events         → SSE stream
 * OPTIONS *                          → CORS preflight
 *
 * Update operations follow the Command pattern:
 *   1. Handler validates inputs and loads room.
 *   2. Handler instantiates the appropriate Command.
 *   3. runCommand() calls command.execute(room) → { patch, logEntry },
 *      pushes an undo snapshot + log entry, then persists atomically.
 */

import { randomUUID } from 'crypto';
import * as dynamo from './dynamo.js';
import { generateMatches, calculateInitialRounds } from './matchGen.js';
import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from './commands.js';

// ── Local-dev shim ────────────────────────────────────────────────────────────
if (typeof awslambda === 'undefined') {
  console.warn('[shim] awslambda not found — using no-op shim (SSE will not stream)');
  globalThis.awslambda = {
    streamifyResponse: (fn) => fn,
    HttpResponseStream: { from(stream) { return stream; } },
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_UNDO = 10;
const MAX_LOG  = 50;

// ── CORS ──────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, X-Host-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

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

/** Strip internal fields before sending to clients. */
function safeRoom(room) {
  return {
    code:              room.code,
    version:           room.version,
    format:            room.format,
    started:           room.started,
    players:           room.players.map(p => ({ name: p.name, gamesPlayed: p.gamesPlayed })),
    matches:           room.matches,
    currentMatchIndex: room.currentMatchIndex,
    operationLog:      room.operationLog || [],
    canUndo:           (room.undoStack || []).length > 0,
  };
}

function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return {}; }
}

function hostToken(event) {
  return event.headers?.['x-host-token'] || parseBody(event).hostToken || '';
}

// ── Undo / log stack helpers ──────────────────────────────────────────────────

function pushUndo(room, snapshot) {
  return [...(room.undoStack || []), snapshot].slice(-MAX_UNDO);
}

function pushLog(room, entry) {
  return [...(room.operationLog || []), { ...entry, ts: new Date().toISOString() }].slice(-MAX_LOG);
}

// ── Command executor ──────────────────────────────────────────────────────────

/**
 * Execute a command against the given room state, persist the result,
 * and write the JSON response.
 *
 * This is the single choke-point for all state-mutating operations,
 * ensuring every command gets undo-snapshot + operation-log treatment.
 */
async function runCommand(code, command, room, expectedVersion, stream) {
  // Snapshot current state before mutation for undo
  const snapshot = {
    matches:           room.matches,
    players:           room.players,
    currentMatchIndex: room.currentMatchIndex,
  };

  const { patch, logEntry } = command.execute(room);

  const undoStack    = pushUndo(room, snapshot);
  const operationLog = pushLog(room, logEntry);

  try {
    const updated = await dynamo.saveState(
      code,
      { ...patch, undoStack, operationLog },
      expectedVersion,
    );
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return err(stream, 409, 'Version conflict — reload and retry');
    }
    throw e;
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleCreateRoom(event, stream) {
  const { playerName, format = 'doubles', additionalPlayers = [] } = parseBody(event);
  if (!playerName?.trim()) return err(stream, 400, 'playerName is required');

  const validFormats = ['doubles', 'singles', 'both'];
  if (!validFormats.includes(format)) return err(stream, 400, 'Invalid format');

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
  } while (await dynamo.getRoom(code));

  const token = randomUUID();
  const room  = await dynamo.createRoom({
    code, hostToken: token, format, started: false,
    players, matches: [], currentMatchIndex: 0,
    undoStack: [], operationLog: [],
  });

  jsonResponse(stream, 201, { hostToken: token, room: safeRoom(room) });
}

async function handleJoinRoom(code, event, stream) {
  const { playerName } = parseBody(event);
  if (!playerName?.trim()) return err(stream, 400, 'playerName is required');

  const room = await dynamo.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.started) return err(stream, 409, 'Session already started');

  const nameTaken = room.players.some(
    p => p.name.toLowerCase() === playerName.trim().toLowerCase()
  );
  if (nameTaken) return err(stream, 409, 'Name already taken in this room');

  const updated = await dynamo.addPlayer(code, { name: playerName.trim(), gamesPlayed: 0 }, room.version);
  jsonResponse(stream, 200, { room: safeRoom(updated) });
}

async function handleGetRoom(code, stream) {
  const room = await dynamo.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  jsonResponse(stream, 200, { room: safeRoom(room) });
}

async function handleSetFormat(code, event, stream) {
  const body = parseBody(event);
  const room = await dynamo.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (room.started) return err(stream, 409, 'Session already started');

  const validFormats = ['doubles', 'singles', 'both'];
  if (!validFormats.includes(body.format)) return err(stream, 400, 'Invalid format');

  try {
    const updated = await dynamo.setFormat(code, body.format, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

async function handleStartSession(code, event, stream) {
  const body = parseBody(event);
  const room = await dynamo.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (room.started) return err(stream, 409, 'Session already started');

  const { format, players } = room;
  if (format !== 'singles' && players.length < 4) return err(stream, 400, 'Need at least 4 players for doubles');
  if (players.length < 2) return err(stream, 400, 'Need at least 2 players');

  const matches = generateMatches(players, calculateInitialRounds(players.length, format), format, 1);
  if (matches.length) matches[0].status = 'active';

  try {
    const updated = await dynamo.startSession(code, matches, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

// ── Command-pattern handlers ──────────────────────────────────────────────────

async function handleMarkMatchDone(code, event, stream) {
  const body = parseBody(event);
  const room = await dynamo.getRoom(code);
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
  const room = await dynamo.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return err(stream, 409, 'No active match');

  return runCommand(code, new SkipMatchCommand(), room, body.version ?? room.version, stream);
}

async function handleEditMatch(code, event, stream) {
  const body = parseBody(event);
  const room = await dynamo.getRoom(code);
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

  const teamSize = match.format === 'doubles' ? 2 : 1;
  if (!Array.isArray(team1) || team1.length !== teamSize) return err(stream, 400, `team1 must have ${teamSize} player(s)`);
  if (!Array.isArray(team2) || team2.length !== teamSize) return err(stream, 400, `team2 must have ${teamSize} player(s)`);

  const allNames = new Set(room.players.map(p => p.name));
  const submitted = [...team1, ...team2];
  for (const name of submitted) {
    if (!allNames.has(name)) return err(stream, 400, `Unknown player: ${name}`);
  }
  if (new Set(submitted).size !== submitted.length) return err(stream, 400, 'Duplicate players in teams');

  return runCommand(code, new EditMatchCommand(matchIndex, team1, team2), room, expectedVersion, stream);
}

// ── Undo (not a Command — restores a previous snapshot directly) ──────────────

async function handleUndoLastOperation(code, event, stream) {
  const body = parseBody(event);
  const room = await dynamo.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const undoStack = room.undoStack || [];
  if (!undoStack.length) return err(stream, 409, 'Nothing to undo');

  const snapshot     = undoStack[undoStack.length - 1];
  const newUndoStack = undoStack.slice(0, -1);
  const operationLog = (room.operationLog || []).slice(0, -1);

  try {
    const updated = await dynamo.saveState(code, {
      matches:           snapshot.matches,
      players:           snapshot.players,
      currentMatchIndex: snapshot.currentMatchIndex,
      undoStack:         newUndoStack,
      operationLog,
    }, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

async function handleAddMatches(code, event, stream) {
  const body = parseBody(event);
  const room = await dynamo.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');

  const count      = Math.min(body.count || 5, 20);
  const startId    = room.matches.length + 1;
  const newMatches = generateMatches(room.players, count, room.format, startId);

  try {
    const updated = await dynamo.appendMatches(code, newMatches, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return err(stream, 409, 'Version conflict — reload and retry');
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
      const room = await dynamo.getRoom(code);
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

// ── Main router ───────────────────────────────────────────────────────────────

// eslint-disable-next-line no-undef
export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const method  = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
  const rawPath = event.rawPath ?? event.path ?? '/';
  const parts   = rawPath.split('/').filter(Boolean);

  if (method === 'OPTIONS') {
    // eslint-disable-next-line no-undef
    const s = awslambda.HttpResponseStream.from(responseStream, { statusCode: 204, headers: corsHeaders });
    s.end();
    return;
  }

  try {
    if (method === 'POST' && parts.length === 1 && parts[0] === 'rooms')
      return await handleCreateRoom(event, responseStream);

    const code = parts[1];

    if (method === 'GET'   && parts.length === 2)                          return await handleGetRoom(code, responseStream);
    if (method === 'GET'   && parts[2] === 'events')                       return await handleSSE(code, event, responseStream);
    if (method === 'POST'  && parts[2] === 'join')                         return await handleJoinRoom(code, event, responseStream);
    if (method === 'PATCH' && parts[2] === 'format')                       return await handleSetFormat(code, event, responseStream);
    if (method === 'POST'  && parts[2] === 'start')                        return await handleStartSession(code, event, responseStream);
    if (method === 'POST'  && parts[2] === 'match' && parts[3] === 'done') return await handleMarkMatchDone(code, event, responseStream);
    if (method === 'POST'  && parts[2] === 'match' && parts[3] === 'skip') return await handleSkipMatch(code, event, responseStream);
    if (method === 'POST'  && parts[2] === 'undo')                         return await handleUndoLastOperation(code, event, responseStream);
    if (method === 'PATCH' && parts[2] === 'match' && !parts[3])           return await handleEditMatch(code, event, responseStream);
    if (method === 'POST'  && parts[2] === 'matches')                      return await handleAddMatches(code, event, responseStream);

    err(responseStream, 404, 'Not found');
  } catch (error) {
    console.error('Unhandled error:', error);
    err(responseStream, 500, 'Internal server error');
  }
});
