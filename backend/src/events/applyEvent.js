/**
 * Event handler — pure function that applies a domain event to a room
 * and returns the state patch to persist.
 *
 * applyEvent(room, event) → patch
 *
 * All state-mutation logic lives here; commands only decide which event to emit.
 */

import { generateMatches, regenerateUnpinnedMatches } from '../matchGen.js';
import {
  MATCH_DONE,
  PLAYER_SKIPPED_WITH_SUB,
  MATCH_SKIPPED,
  MATCH_EDITED,
} from './types.js';

export function applyEvent(room, event) {
  switch (event.type) {
    case MATCH_DONE:              return applyMatchDone(room, event);
    case PLAYER_SKIPPED_WITH_SUB: return applyPlayerSkippedWithSub(room, event);
    case MATCH_SKIPPED:           return applyMatchSkipped(room, event);
    case MATCH_EDITED:            return applyMatchEdited(room, event);
    default: throw new Error(`Unknown event type: ${event.type}`);
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function applyMatchDone(room, { matchIndex, winner }) {
  const match = room.matches[matchIndex];

  const updatedMatches = [...room.matches];
  updatedMatches[matchIndex] = { ...match, status: 'done', winner };

  const nextIdx = matchIndex + 1;
  if (nextIdx < updatedMatches.length) {
    updatedMatches[nextIdx] = { ...updatedMatches[nextIdx], status: 'active' };
  }

  const participants   = new Set([...match.team1, ...match.team2]);
  const updatedPlayers = room.players.map(p =>
    participants.has(p.name) ? { ...p, gamesPlayed: p.gamesPlayed + 1 } : p
  );

  const unavailablePlayers = (room.unavailablePlayers ?? []).filter(
    p => p.availableFrom > nextIdx
  );

  return {
    matches:            updatedMatches,
    players:            updatedPlayers,
    currentMatchIndex:  nextIdx,
    unavailablePlayers,
  };
}

function applyPlayerSkippedWithSub(room, { matchIndex, playerName, substituteName }) {
  const match = room.matches[matchIndex];

  const newUnavailablePlayers = [
    ...(room.unavailablePlayers ?? []),
    { name: playerName, availableFrom: matchIndex + 1 },
  ];

  // Build the 4-player pool: existing court players minus skipper, plus sub
  const pool = [...match.team1, ...match.team2]
    .filter(n => n !== playerName)
    .map(name => {
      const p = room.players.find(rp => rp.name === name);
      return { name, gamesPlayed: p?.gamesPlayed ?? 0 };
    });
  const sub = room.players.find(p => p.name === substituteName);
  pool.push({ name: substituteName, gamesPlayed: sub?.gamesPlayed ?? 0 });

  const [newMatch]     = generateMatches(pool, 1, match.id);
  const updatedMatches = [...room.matches];
  updatedMatches[matchIndex] = {
    ...(newMatch ?? match),
    id:     match.id,
    status: 'active',
    winner: null,
  };

  return {
    matches:            updatedMatches,
    unavailablePlayers: newUnavailablePlayers,
  };
}

function applyMatchSkipped(room, { matchIndex, playerName }) {
  const match = room.matches[matchIndex];

  const updatedMatches = [...room.matches];
  updatedMatches[matchIndex] = { ...match, status: 'skipped', winner: null };

  const nextIdx = matchIndex + 1;
  if (nextIdx < updatedMatches.length) {
    updatedMatches[nextIdx] = { ...updatedMatches[nextIdx], status: 'active' };
  }

  const newUnavailablePlayers = [
    ...(room.unavailablePlayers ?? []),
    { name: playerName, availableFrom: matchIndex + 1 },
  ];
  const unavailablePlayers = newUnavailablePlayers.filter(
    p => p.availableFrom > nextIdx
  );

  return {
    matches:            updatedMatches,
    currentMatchIndex:  nextIdx,
    unavailablePlayers,
  };
}

function applyMatchEdited(room, { matchIndex, team1, team2 }) {
  const match = room.matches[matchIndex];

  const updatedMatches = [...room.matches];
  updatedMatches[matchIndex] = { ...match, team1, team2, pinned: true };

  const newPending    = regenerateUnpinnedMatches(updatedMatches, matchIndex, room.players);
  const finalMatches  = [
    ...updatedMatches.slice(0, matchIndex + 1),
    ...newPending,
  ];

  return { matches: finalMatches };
}
