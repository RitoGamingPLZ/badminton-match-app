/**
 * Express application — all routes and handlers for local development.
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
 */

import express from 'express';
import { randomUUID } from 'crypto';
import { getRepository, VersionConflictError } from './db/index.js';
import { generateMatches, calculateInitialRounds } from './matchGen.js';
import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from './commands.js';

const db = getRepository();

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function hostToken(req) {
  return req.headers['x-host-token'] || req.body?.hostToken || '';
}

function pushUndo(room, snapshot) {
  return [...(room.undoStack || []), snapshot].slice(-MAX_UNDO);
}

function pushLog(room, entry) {
  return [...(room.operationLog || []), { ...entry, ts: new Date().toISOString() }].slice(-MAX_LOG);
}

// ── Command executor ──────────────────────────────────────────────────────────

async function runCommand(code, command, room, expectedVersion, res) {
  const snapshot = {
    matches:           room.matches,
    players:           room.players,
    currentMatchIndex: room.currentMatchIndex,
  };

  const { patch, logEntry } = command.execute(room);

  const undoStack    = pushUndo(room, snapshot);
  const operationLog = pushLog(room, logEntry);

  try {
    const updated = await db.saveState(
      code,
      { ...patch, undoStack, operationLog },
      expectedVersion,
    );
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return res.status(409).json({ error: 'Version conflict — reload and retry' });
    }
    throw e;
  }
}

// ── SSE constants ─────────────────────────────────────────────────────────────

const SSE_MAX_MS  = 10 * 60 * 1000;
const SSE_POLL_MS = 2000;
const SSE_PING_MS = 30 * 1000;

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.post('/rooms', async (req, res) => {
  const { playerName, additionalPlayers = [] } = req.body;
  if (!playerName?.trim()) return res.status(400).json({ error: 'playerName is required' });

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
    if (++attempts > 20) return res.status(503).json({ error: 'Could not generate unique room code' });
  } while (await db.getRoom(code));

  const token = randomUUID();
  const room  = await db.createRoom({
    code, hostToken: token, format: 'doubles', started: false,
    players, matches: [], currentMatchIndex: 0,
    undoStack: [], operationLog: [],
  });

  res.status(201).json({ hostToken: token, room: safeRoom(room) });
});

app.post('/rooms/:code/join', async (req, res) => {
  const { code } = req.params;
  const { playerName } = req.body;
  if (!playerName?.trim()) return res.status(400).json({ error: 'playerName is required' });

  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.started) return res.status(409).json({ error: 'Session already started' });

  const nameTaken = room.players.some(
    p => p.name.toLowerCase() === playerName.trim().toLowerCase()
  );
  if (nameTaken) return res.status(409).json({ error: 'Name already taken in this room' });

  const updated = await db.addPlayer(code, { name: playerName.trim(), gamesPlayed: 0 }, room.version);
  res.status(200).json({ room: safeRoom(updated) });
});

app.get('/rooms/:code', async (req, res) => {
  const room = await db.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.status(200).json({ room: safeRoom(room) });
});

app.post('/rooms/:code/start', async (req, res) => {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: 'Not the host' });
  if (room.started) return res.status(409).json({ error: 'Session already started' });

  const { players } = room;
  if (players.length < 4) return res.status(400).json({ error: 'Need at least 4 players for doubles' });

  const matches = generateMatches(players, calculateInitialRounds(players.length), 1);
  if (matches.length) matches[0].status = 'active';

  try {
    const updated = await db.startSession(code, matches, req.body.version ?? room.version);
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: 'Version conflict — reload and retry' });
    throw e;
  }
});

app.post('/rooms/:code/match/done', async (req, res) => {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: 'Not the host' });
  if (!room.started) return res.status(409).json({ error: 'Session not started' });

  const { winner, version: expectedVersion = room.version } = req.body;
  if (winner !== 1 && winner !== 2) return res.status(400).json({ error: 'winner must be 1 or 2' });

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return res.status(409).json({ error: 'No active match' });

  return runCommand(code, new MatchDoneCommand(winner), room, expectedVersion, res);
});

app.post('/rooms/:code/match/skip', async (req, res) => {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: 'Not the host' });
  if (!room.started) return res.status(409).json({ error: 'Session not started' });

  const { playerName, version } = req.body;
  if (!playerName?.trim()) return res.status(400).json({ error: 'playerName is required' });

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return res.status(409).json({ error: 'No active match' });

  const allPlayers = new Set([...match.team1, ...match.team2]);
  if (!allPlayers.has(playerName)) return res.status(400).json({ error: `${playerName} is not in the current match` });

  return runCommand(code, new SkipMatchCommand(playerName), room, version ?? room.version, res);
});

app.post('/rooms/:code/undo', async (req, res) => {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: 'Not the host' });
  if (!room.started) return res.status(409).json({ error: 'Session not started' });

  const undoStack = room.undoStack || [];
  if (!undoStack.length) return res.status(409).json({ error: 'Nothing to undo' });

  const snapshot     = undoStack[undoStack.length - 1];
  const newUndoStack = undoStack.slice(0, -1);
  const operationLog = (room.operationLog || []).slice(0, -1);

  try {
    const updated = await db.saveState(code, {
      matches:           snapshot.matches,
      players:           snapshot.players,
      currentMatchIndex: snapshot.currentMatchIndex,
      undoStack:         newUndoStack,
      operationLog,
    }, req.body.version ?? room.version);
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: 'Version conflict — reload and retry' });
    throw e;
  }
});

app.patch('/rooms/:code/match', async (req, res) => {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: 'Not the host' });
  if (!room.started) return res.status(409).json({ error: 'Session not started' });

  const { team1, team2, version: expectedVersion = room.version } = req.body;
  const matchIndex = req.body.matchIndex ?? room.currentMatchIndex;

  const match = room.matches[matchIndex];
  if (!match) return res.status(400).json({ error: `Match index ${matchIndex} does not exist` });
  if (match.status === 'done' || match.status === 'skipped') {
    return res.status(409).json({ error: 'Cannot edit a completed or skipped match' });
  }

  if (!Array.isArray(team1) || team1.length !== 2) return res.status(400).json({ error: 'team1 must have 2 players' });
  if (!Array.isArray(team2) || team2.length !== 2) return res.status(400).json({ error: 'team2 must have 2 players' });

  const allNames = new Set(room.players.map(p => p.name));
  const submitted = [...team1, ...team2];
  for (const name of submitted) {
    if (!allNames.has(name)) return res.status(400).json({ error: `Unknown player: ${name}` });
  }
  if (new Set(submitted).size !== submitted.length) return res.status(400).json({ error: 'Duplicate players in teams' });

  return runCommand(code, new EditMatchCommand(matchIndex, team1, team2), room, expectedVersion, res);
});

app.post('/rooms/:code/matches', async (req, res) => {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: 'Not the host' });

  const count      = Math.min(req.body.count || 5, 20);
  const startId    = room.matches.length + 1;
  const newMatches = generateMatches(room.players, count, startId);

  try {
    const updated = await db.appendMatches(code, newMatches, req.body.version ?? room.version);
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: 'Version conflict — reload and retry' });
    throw e;
  }
});

app.get('/rooms/:code/events', async (req, res) => {
  const { code } = req.params;
  let clientVersion = parseInt(req.query.version ?? '0', 10);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const write = data => { try { res.write(data); } catch { /* client disconnected */ } };
  write(`: connected to room ${code}\n\n`);

  const startTime = Date.now();
  let lastPing    = startTime;

  try {
    while (Date.now() - startTime < SSE_MAX_MS) {
      // Stop if client disconnected
      if (res.destroyed) break;

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
  res.end();
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
