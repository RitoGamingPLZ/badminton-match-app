/**
 * Match generation utilities.
 * All functions are pure — they take player data and return match arrays.
 * gamesPlayed is preserved across regeneration, so fairness survives edits.
 */

/**
 * Generate doubles matches (2v2).
 * Players with fewer games are prioritised.
 * Team pairings rotate to avoid always-same-partner situations.
 *
 * @param {Array<{name: string, gamesPlayed: number}>} players
 * @param {number} rounds - number of matches to generate
 * @param {number} startId - first match ID
 */
export function generateDoublesMatches(players, rounds, startId = 1) {
  if (players.length < 4) return [];

  const playCount = Object.fromEntries(players.map(p => [p.name, p.gamesPlayed]));
  const pairCount = {}; // how many times two players have been on the same team

  const pairKey = (a, b) => [a, b].sort().join('||');

  const matches = [];
  for (let r = 0; r < rounds; r++) {
    // Pick 4 players with fewest games, breaking ties randomly
    const sorted = [...players]
      .map(p => p.name)
      .sort((a, b) => {
        const diff = playCount[a] - playCount[b];
        return diff !== 0 ? diff : Math.random() - 0.5;
      });

    const pool = sorted.slice(0, 4);

    // Evaluate 3 possible team splits; prefer the one with fewest repeated pairings
    const splits = [
      { t1: [pool[0], pool[1]], t2: [pool[2], pool[3]] },
      { t1: [pool[0], pool[2]], t2: [pool[1], pool[3]] },
      { t1: [pool[0], pool[3]], t2: [pool[1], pool[2]] },
    ];

    const splitScore = ({ t1, t2 }) =>
      (pairCount[pairKey(t1[0], t1[1])] || 0) +
      (pairCount[pairKey(t2[0], t2[1])] || 0);

    splits.sort((a, b) => splitScore(a) - splitScore(b));
    const { t1, t2 } = splits[0];

    // Update bookkeeping
    pairCount[pairKey(t1[0], t1[1])] = (pairCount[pairKey(t1[0], t1[1])] || 0) + 1;
    pairCount[pairKey(t2[0], t2[1])] = (pairCount[pairKey(t2[0], t2[1])] || 0) + 1;
    pool.forEach(n => playCount[n]++);

    matches.push({
      id: startId + r,
      team1: t1,
      team2: t2,
      format: 'doubles',
      status: 'pending',
      winner: null,
      pinned: false,
    });
  }

  return matches;
}

/**
 * Generate singles matches (1v1).
 * Prioritises players with fewest games, then matchups that haven't happened yet.
 *
 * @param {Array<{name: string, gamesPlayed: number}>} players
 * @param {number} rounds
 * @param {number} startId
 */
export function generateSinglesMatches(players, rounds, startId = 1) {
  if (players.length < 2) return [];

  const playCount = Object.fromEntries(players.map(p => [p.name, p.gamesPlayed]));
  const matchupCount = {}; // times player A has faced player B
  const matchupKey = (a, b) => [a, b].sort().join('||');

  const matches = [];
  for (let r = 0; r < rounds; r++) {
    const names = players.map(p => p.name);
    const candidates = [...names].sort((a, b) => {
      const diff = playCount[a] - playCount[b];
      return diff !== 0 ? diff : Math.random() - 0.5;
    }).slice(0, Math.min(names.length, 8));

    // Find the pair with lowest (matchup repetition × 100 + combined play count)
    let bestP1 = null, bestP2 = null, bestScore = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const key = matchupKey(candidates[i], candidates[j]);
        const score = (matchupCount[key] || 0) * 100 + playCount[candidates[i]] + playCount[candidates[j]];
        if (score < bestScore) {
          bestScore = score;
          bestP1 = candidates[i];
          bestP2 = candidates[j];
        }
      }
    }

    const key = matchupKey(bestP1, bestP2);
    matchupCount[key] = (matchupCount[key] || 0) + 1;
    playCount[bestP1]++;
    playCount[bestP2]++;

    matches.push({
      id: startId + r,
      team1: [bestP1],
      team2: [bestP2],
      format: 'singles',
      status: 'pending',
      winner: null,
      pinned: false,
    });
  }

  return matches;
}

/**
 * Generate interleaved doubles + singles matches.
 */
export function generateMixedMatches(players, rounds, startId = 1) {
  const doublesRounds = Math.ceil(rounds / 2);
  const singlesRounds = Math.floor(rounds / 2);

  const doubles = generateDoublesMatches(players, doublesRounds, 0);
  const singles = generateSinglesMatches(players, singlesRounds, 0);

  const mixed = [];
  let di = 0, si = 0;
  while (di < doubles.length || si < singles.length) {
    if (di < doubles.length) mixed.push(doubles[di++]);
    if (si < singles.length) mixed.push(singles[si++]);
  }

  // Reassign IDs sequentially
  return mixed.map((m, i) => ({ ...m, id: startId + i }));
}

/**
 * Choose the right generator based on format.
 */
export function generateMatches(players, rounds, format, startId = 1) {
  if (format === 'singles') return generateSinglesMatches(players, rounds, startId);
  if (format === 'both') return generateMixedMatches(players, rounds, startId);
  return generateDoublesMatches(players, rounds, startId);
}

/**
 * Calculate how many rounds to generate for a fresh session.
 */
export function calculateInitialRounds(playerCount, format) {
  if (format === 'doubles') return Math.max(10, Math.ceil((playerCount * 8) / 4));
  if (format === 'singles') return Math.max(10, playerCount * 2);
  return Math.max(12, playerCount * 3);
}

/**
 * Regenerate only the pending (future) matches after an edit.
 * Completed matches and play counts are preserved.
 *
 * @param {Array} allMatches - full match list (done + active + pending)
 * @param {number} activeIndex - index of the current match being edited/played
 * @param {Array<{name: string, gamesPlayed: number}>} players
 * @param {string} format
 */
export function regeneratePendingMatches(allMatches, activeIndex, players, format) {
  const pendingCount = allMatches.length - activeIndex - 1; // keep same total
  const nextId = (allMatches[activeIndex]?.id ?? activeIndex) + 1;

  const pending = generateMatches(players, Math.max(pendingCount, 5), format, nextId);

  // Reassign IDs cleanly
  const base = allMatches[activeIndex]?.id ?? activeIndex;
  return pending.map((m, i) => ({ ...m, id: base + 1 + i }));
}

/**
 * Regenerate non-pinned pending matches after `afterIndex`, preserving pinned ones.
 *
 * Pinned matches (manually edited) stay in place. The fairness algorithm fills
 * the unpinned slots, accounting for players already committed in pinned matches.
 *
 * @param {Array} allMatches - full match array
 * @param {number} afterIndex - regenerate matches strictly after this index
 * @param {Array<{name: string, gamesPlayed: number}>} players
 * @param {string} format
 */
export function regenerateUnpinnedMatches(allMatches, afterIndex, players, format) {
  const pending = allMatches.slice(afterIndex + 1);
  if (pending.length === 0) return [];

  const pinned = pending.filter(m => m.pinned);
  const unpinnedCount = pending.length - pinned.length;

  // Adjust virtual gamesPlayed to account for players committed in pinned matches
  const virtualPlayers = players.map(p => ({ ...p }));
  for (const m of pinned) {
    const participants = [...m.team1, ...m.team2];
    for (const vp of virtualPlayers) {
      if (participants.includes(vp.name)) vp.gamesPlayed++;
    }
  }

  // Generate fresh matches for unpinned slots
  const baseId = allMatches[afterIndex]?.id ?? afterIndex;
  const newUnpinned = generateMatches(
    virtualPlayers,
    Math.max(unpinnedCount, 3),
    format,
    baseId + 1,
  );

  // Interleave: keep pinned at their positions, fill gaps with newly generated
  const result = [];
  let unpinnedIdx = 0;
  for (const m of pending) {
    if (m.pinned) {
      result.push(m);
    } else {
      if (unpinnedIdx < newUnpinned.length) result.push(newUnpinned[unpinnedIdx++]);
    }
  }

  // Reassign IDs sequentially
  return result.map((m, i) => ({ ...m, id: baseId + 1 + i }));
}
