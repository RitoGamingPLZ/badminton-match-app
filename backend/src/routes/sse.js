/**
 * SSE (Server-Sent Events) handler.
 *
 * Owns the HTTP transport layer only — the polling loop lives in
 * SessionService.watchRoom(), which yields typed event descriptors.
 */

import { corsHeaders } from '../config.js';
import { sessionService } from '../services/index.js';

export async function handleSSE(req, res) {
  const { code }        = req.params;
  const startVersion    = parseInt(req.query.version ?? '0', 10);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);
  res.flushHeaders();

  const write = data => { try { res.write(data); } catch { /* client disconnected */ } };
  write(`: connected to room ${code}\n\n`);

  try {
    for await (const event of sessionService.watchRoom(code, startVersion)) {
      if (res.destroyed) break;
      if (event.type === 'data')  { write(`data: ${JSON.stringify(event.room)}\n\n`); continue; }
      if (event.type === 'ping')  { write(': ping\n\n'); continue; }
      if (event.type === 'error') { write(`event: error\ndata: ${JSON.stringify({ message: event.message })}\n\n`); break; }
      if (event.type === 'close') break;
    }
  } catch (error) {
    write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
  }

  write('event: close\ndata: {}\n\n');
  res.end();
}
