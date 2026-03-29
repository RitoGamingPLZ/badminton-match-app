/**
 * SSE (Server-Sent Events) handler for live room updates.
 *
 * Bypasses Express and writes directly to the Lambda response stream
 * to support long-lived connections beyond the API Gateway 29s limit.
 */

import { corsHeaders, safeRoom } from '../helpers.js';
import { db } from './helpers.js';

const SSE_MAX_MS  = 10 * 60 * 1000;
const SSE_POLL_MS = 2000;
const SSE_PING_MS = 30 * 1000;

export async function handleSSE(code, event, responseStream) {
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
