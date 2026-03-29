/**
 * SSE (Server-Sent Events) handler for live room updates.
 */

import { corsHeaders } from '../config.js';
import { safeRoom } from '../roomUtils.js';
import { withRetry } from '../db/transaction.js';
import { db } from './helpers.js';

const SSE_MAX_MS  = 10 * 60 * 1000;
const SSE_POLL_MS = 2000;
const SSE_PING_MS = 30 * 1000;

export async function handleSSE(req, res) {
  const { code } = req.params;
  let clientVersion = parseInt(req.query.version ?? '0', 10);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);
  res.flushHeaders();

  const write = data => { try { res.write(data); } catch { /* client disconnected */ } };
  write(`: connected to room ${code}\n\n`);

  const startTime = Date.now();
  let lastPing    = startTime;

  try {
    while (Date.now() - startTime < SSE_MAX_MS) {
      if (res.destroyed) break;

      const room = await withRetry(() => db.getRoom(code));
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
}
