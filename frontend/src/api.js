/**
 * API client — REST + SSE.
 *
 * Base URL is read from the environment variable VITE_API_BASE.
 * During local dev (vite proxy), requests go to /api/* which Vite proxies
 * to SAM local on port 3001.
 */

const BASE = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace(/\/$/, '')
  : '/api'

async function request(method, path, body, hostToken) {
  const headers = { 'Content-Type': 'application/json' }
  if (hostToken) headers['X-Host-Token'] = hostToken

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data })
  return data
}

export const api = {
  // Room lifecycle
  createRoom: (playerName, additionalPlayers = []) =>
    request('POST', '/rooms', { playerName, additionalPlayers }),

  joinRoom: (code, playerName) =>
    request('POST', `/rooms/${code}/join`, { playerName }),

  getRoom: (code) =>
    request('GET', `/rooms/${code}`),

  startSession: (code, version, hostToken) =>
    request('POST', `/rooms/${code}/start`, { version }, hostToken),

  // Match control
  markMatchDone: (code, winner, version, hostToken) =>
    request('POST', `/rooms/${code}/match/done`, { winner, version }, hostToken),

  skipMatch: (code, playerName, version, skipFrom) =>
    request('POST', `/rooms/${code}/match/skip`, { playerName, version, skipFrom }),

  undo: (code, version, hostToken) =>
    request('POST', `/rooms/${code}/undo`, { version }, hostToken),

  // matchIndex: optional — defaults to current active match on the server
  editMatch: (code, matchIndex, team1, team2, version, hostToken) =>
    request('PATCH', `/rooms/${code}/match`, { matchIndex, team1, team2, version }, hostToken),

  addMatches: (code, count, version, hostToken) =>
    request('POST', `/rooms/${code}/matches`, { count, version }, hostToken),
}

/**
 * Open an SSE connection to the room's event stream.
 * Automatically reconnects on error after a delay.
 *
 * @param {string} code - room code
 * @param {number} version - current known version (server sends only newer events)
 * @param {(room: object) => void} onUpdate - called with the new safe room state
 * @returns {{ close: () => void }} - call close() to stop
 */
export function openSSE(code, version, onUpdate) {
  let es = null
  let closed = false
  let reconnectTimer = null

  function connect(v) {
    if (closed) return
    const url = `${BASE}/rooms/${code}/events?version=${v}`
    es = new EventSource(url)

    es.onmessage = (e) => {
      try {
        const room = JSON.parse(e.data)
        onUpdate(room)
        v = room.version
      } catch { /* ignore parse errors */ }
    }

    es.addEventListener('close', () => {
      es.close()
      if (!closed) reconnectTimer = setTimeout(() => connect(v), 5000)
    })

    es.addEventListener('error_event', (e) => {
      try { console.warn('SSE server error:', JSON.parse(e.data)) } catch { /* noop */ }
    })

    es.onerror = () => {
      es.close()
      if (!closed) reconnectTimer = setTimeout(() => connect(v), 3000)
    }
  }

  connect(version)

  return {
    close() {
      closed = true
      clearTimeout(reconnectTimer)
      es?.close()
    },
  }
}
