/**
 * Single Lambda handler for all routes — REST + SSE.
 *
 * Uses Lambda Response Streaming (awslambda.streamifyResponse) so that
 * SSE connections can stay open for up to 15 minutes without hitting the
 * 29-second API Gateway limit.  Non-SSE routes write once and end immediately.
 *
 * Routes
 * ──────
 * POST   /rooms                    → createRoom
 * POST   /rooms/:code/join         → joinRoom
 * GET    /rooms/:code              → getRoom
 * PATCH  /rooms/:code/format       → setFormat
 * POST   /rooms/:code/start        → startSession
 * PATCH  /rooms/:code/match        → editMatch  (edit active + regenerate pending)
 * POST   /rooms/:code/match/done   → markMatchDone
 * POST   /rooms/:code/matches      → addMatches
 * GET    /rooms/:code/events       → SSE stream
 * OPTIONS *                        → CORS preflight
 */

import { randomUUID } from 'crypto';
import * as dynamo from './dynamo.js';

// ── Local-dev shim ────────────────────────────────────────────────────────────
// The `awslambda` global is injected by the Lambda runtime (Node 20).
// SAM local (Docker) also provides it. This shim prevents module-load crashes
// in plain Node.js environments (e.g. unit tests).
if (typeof awslambda === 'undefined') {
  /* eslint-disable no-console */
  console.warn('[shim] awslambda not found — using no-op shim (SSE will not stream)');
  globalThis.awslambda = {
    streamifyResponse: (fn) => fn,
    HttpResponseStream: {
      from(stream, _meta) { return stream; },
    },
  };
}
import {
  generateMatches,
  calculateInitialRounds,
  regeneratePendingMatches,
} from './matchGen.js';

// ── CORS ──────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, X-Host-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    code: room.code,
    version: room.version,
    format: room.format,
    started: room.started,
    players: room.players.map(p => ({ name: p.name, gamesPlayed: p.gamesPlayed })),
    matches: room.matches,
    currentMatchIndex: room.currentMatchIndex,
  };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    return {};
  }
}

function hostToken(event) {
  return event.headers?.['x-host-token'] || parseBody(event).hostToken || '';
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleCreateRoom(event, stream) {
  const { playerName, format = 'doubles' } = parseBody(event);
  if (!playerName?.trim()) return err(stream, 400, 'playerName is required');

  const validFormats = ['doubles', 'singles', 'both'];
  if (!validFormats.includes(format)) return err(stream, 400, 'Invalid format');

  // Generate a unique 4-digit code
  let code, attempts = 0;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
    attempts++;
    if (attempts > 20) return err(stream, 503, 'Could not generate unique room code');
  } while (await dynamo.getRoom(code));

  const token = randomUUID();
  const room = await dynamo.createRoom({
    code,
    hostToken: token,
    format,
    started: false,
    players: [{ name: playerName.trim(), gamesPlayed: 0 }],
    matches: [],
    currentMatchIndex: 0,
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

  const expectedVersion = body.version ?? room.version;
  try {
    const updated = await dynamo.setFormat(code, body.format, expectedVersion);
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

  const totalRounds = calculateInitialRounds(players.length, format);
  const matches = generateMatches(players, totalRounds, format, 1);
  if (matches.length > 0) matches[0].status = 'active';

  const expectedVersion = body.version ?? room.version;
  try {
    const updated = await dynamo.startSession(code, matches, expectedVersion);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

async function handleMarkMatchDone(code, event, stream) {
  const body = parseBody(event);
  const room = await dynamo.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const { winner, version: expectedVersion = room.version } = body;
  if (winner !== 1 && winner !== 2) return err(stream, 400, 'winner must be 1 or 2');

  const idx = room.currentMatchIndex;
  const match = room.matches[idx];
  if (!match || match.status !== 'active') return err(stream, 409, 'No active match');

  // Update match
  const updatedMatches = [...room.matches];
  updatedMatches[idx] = { ...match, status: 'done', winner };

  const nextIdx = idx + 1;
  if (nextIdx < updatedMatches.length) {
    updatedMatches[nextIdx] = { ...updatedMatches[nextIdx], status: 'active' };
  }

  // Increment gamesPlayed for participants
  const participants = new Set([...match.team1, ...match.team2]);
  const updatedPlayers = room.players.map(p =>
    participants.has(p.name) ? { ...p, gamesPlayed: p.gamesPlayed + 1 } : p
  );

  try {
    const updated = await dynamo.markMatchDone(
      code, idx, winner, updatedMatches, updatedPlayers, nextIdx, expectedVersion
    );
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

async function handleEditMatch(code, event, stream) {
  const body = parseBody(event);
  const room = await dynamo.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const { team1, team2, version: expectedVersion = room.version } = body;

  // Validate team arrays match the format
  const idx = room.currentMatchIndex;
  const match = room.matches[idx];
  if (!match || match.status !== 'active') return err(stream, 409, 'No active match to edit');

  const isDoubles = match.format === 'doubles';
  const teamSize = isDoubles ? 2 : 1;
  if (!Array.isArray(team1) || team1.length !== teamSize) return err(stream, 400, `team1 must have ${teamSize} player(s)`);
  if (!Array.isArray(team2) || team2.length !== teamSize) return err(stream, 400, `team2 must have ${teamSize} player(s)`);

  const allNames = new Set(room.players.map(p => p.name));
  const submitted = [...team1, ...team2];
  for (const name of submitted) {
    if (!allNames.has(name)) return err(stream, 400, `Unknown player: ${name}`);
  }
  if (new Set(submitted).size !== submitted.length) return err(stream, 400, 'Duplicate players in teams');

  // Update the active match
  const updatedMatches = [...room.matches];
  updatedMatches[idx] = { ...match, team1, team2 };

  // Regenerate all pending (future) matches based on CURRENT gamesPlayed
  const newPending = regeneratePendingMatches(
    updatedMatches, idx, room.players, match.format
  );

  // Replace pending matches with freshly generated ones
  const finalMatches = [
    ...updatedMatches.slice(0, idx + 1),
    ...newPending,
  ];

  try {
    const updated = await dynamo.editMatch(code, finalMatches, expectedVersion);
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

  const count = Math.min(body.count || 5, 20);
  const startId = room.matches.length + 1;
  const newMatches = generateMatches(room.players, count, room.format, startId);

  const { version: expectedVersion = room.version } = body;
  try {
    const updated = await dynamo.appendMatches(code, newMatches, expectedVersion);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

// ── SSE handler ───────────────────────────────────────────────────────────────

const SSE_MAX_MS = 10 * 60 * 1000;   // 10 minutes max per connection
const SSE_POLL_MS = 2000;             // poll DynamoDB every 2 seconds
const SSE_PING_MS = 30 * 1000;        // keepalive comment every 30 seconds

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

  const write = (data) => {
    try { stream.write(data); } catch { /* client disconnected */ }
  };

  write(`: connected to room ${code}\n\n`);

  const startTime = Date.now();
  let lastPing = startTime;

  try {
    while (Date.now() - startTime < SSE_MAX_MS) {
      const room = await dynamo.getRoom(code);

      if (!room) {
        write('event: error\ndata: {"message":"Room not found"}\n\n');
        break;
      }

      if (room.version > clientVersion) {
        clientVersion = room.version;
        write(`data: ${JSON.stringify(safeRoom(room))}\n\n`);
      }

      // Keepalive ping
      const now = Date.now();
      if (now - lastPing >= SSE_PING_MS) {
        write(': ping\n\n');
        lastPing = now;
      }

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
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
  const rawPath = event.rawPath ?? event.path ?? '/';
  const parts = rawPath.split('/').filter(Boolean); // e.g. ['rooms', '1234', 'join']

  // CORS preflight
  if (method === 'OPTIONS') {
    // eslint-disable-next-line no-undef
    const s = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 204,
      headers: corsHeaders,
    });
    s.end();
    return;
  }

  try {
    // POST /rooms
    if (method === 'POST' && parts.length === 1 && parts[0] === 'rooms') {
      return await handleCreateRoom(event, responseStream);
    }

    const code = parts[1];

    // GET /rooms/:code
    if (method === 'GET' && parts.length === 2) {
      return await handleGetRoom(code, responseStream);
    }

    // GET /rooms/:code/events  (SSE)
    if (method === 'GET' && parts[2] === 'events') {
      return await handleSSE(code, event, responseStream);
    }

    // POST /rooms/:code/join
    if (method === 'POST' && parts[2] === 'join') {
      return await handleJoinRoom(code, event, responseStream);
    }

    // PATCH /rooms/:code/format
    if (method === 'PATCH' && parts[2] === 'format') {
      return await handleSetFormat(code, event, responseStream);
    }

    // POST /rooms/:code/start
    if (method === 'POST' && parts[2] === 'start') {
      return await handleStartSession(code, event, responseStream);
    }

    // POST /rooms/:code/match/done
    if (method === 'POST' && parts[2] === 'match' && parts[3] === 'done') {
      return await handleMarkMatchDone(code, event, responseStream);
    }

    // PATCH /rooms/:code/match  (edit active match)
    if (method === 'PATCH' && parts[2] === 'match' && !parts[3]) {
      return await handleEditMatch(code, event, responseStream);
    }

    // POST /rooms/:code/matches  (add more)
    if (method === 'POST' && parts[2] === 'matches') {
      return await handleAddMatches(code, event, responseStream);
    }

    err(responseStream, 404, 'Not found');
  } catch (error) {
    console.error('Unhandled error:', error);
    err(responseStream, 500, 'Internal server error');
  }
});
