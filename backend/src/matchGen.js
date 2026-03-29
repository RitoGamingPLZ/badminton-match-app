/**
 * Match generation utilities — doubles (2v2) only.
 * All functions are pure — they take player data and return match arrays.
 * gamesPlayed is preserved across regeneration, so fairness survives edits.
 *
 * A MinHeap is used to pick the lowest-game-count players in O(log n) per
 * extraction rather than O(n log n) per sort.  Tiebreaking uses a re-randomised
 * jitter so every round gets a fresh random ordering among equally-played players.
 */

// ── Min-Heap ──────────────────────────────────────────────────────────────────

class MinHeap {
  #data = [];
  #cmp;

  constructor(cmp) { this.#cmp = cmp; }

  get size() { return this.#data.length; }

  push(v) {
    this.#data.push(v);
    let i = this.#data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.#cmp(this.#data[i], this.#data[p]) >= 0) break;
      [this.#data[i], this.#data[p]] = [this.#data[p], this.#data[i]];
      i = p;
    }
  }

  pop() {
    if (!this.#data.length) return undefined;
    const top = this.#data[0];
    const last = this.#data.pop();
    if (this.#data.length) {
      this.#data[0] = last;
      let i = 0;
      while (true) {
        let m = i;
        const l = 2 * i + 1, r = 2 * i + 2;
        if (l < this.#data.length && this.#cmp(this.#data[l], this.#data[m]) < 0) m = l;
        if (r < this.#data.length && this.#cmp(this.#data[r], this.#data[m]) < 0) m = r;
        if (m === i) break;
        [this.#data[i], this.#data[m]] = [this.#data[m], this.#data[i]];
        i = m;
      }
    }
    return top;
  }
}

/** Heap entry comparator: order by count, break ties with random jitter. */
const byCnt = (a, b) => a.cnt - b.cnt || a.jit - b.jit;

/** Build an initial heap entry for a player. */
const entry = (name, cnt) => ({ name, cnt, jit: Math.random() });

// ── Helpers ───────────────────────────────────────────────────────────────────

const pairKey = (a, b) => JSON.stringify(a < b ? [a, b] : [b, a]);

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Generate doubles matches (2v2).
 * Players with fewer games are prioritised; ties broken randomly each round.
 * Team pairings rotate to avoid always-same-partner repetition.
 */
export function generateMatches(players, rounds, startId = 1) {
  if (players.length < 4) return [];

  const heap = new MinHeap(byCnt);
  for (const p of players) heap.push(entry(p.name, p.gamesPlayed));

  const pairCnt = {};

  const matches = [];
  for (let r = 0; r < rounds; r++) {
    // Pop the 4 lowest-count players (re-jittered on each push-back → fresh randomness)
    const pool = [heap.pop(), heap.pop(), heap.pop(), heap.pop()];

    // Evaluate all 3 possible 2v2 splits; pick the one with fewest repeated pairings
    const splits = [
      { t1: [pool[0].name, pool[1].name], t2: [pool[2].name, pool[3].name] },
      { t1: [pool[0].name, pool[2].name], t2: [pool[1].name, pool[3].name] },
      { t1: [pool[0].name, pool[3].name], t2: [pool[1].name, pool[2].name] },
    ];
    const score = ({ t1, t2 }) =>
      (pairCnt[pairKey(t1[0], t1[1])] || 0) + (pairCnt[pairKey(t2[0], t2[1])] || 0);
    splits.sort((a, b) => score(a) - score(b));
    const { t1, t2 } = splits[0];

    // Update bookkeeping
    pairCnt[pairKey(t1[0], t1[1])] = (pairCnt[pairKey(t1[0], t1[1])] || 0) + 1;
    pairCnt[pairKey(t2[0], t2[1])] = (pairCnt[pairKey(t2[0], t2[1])] || 0) + 1;
    const played = new Set([...t1, ...t2]);

    // Push back with updated counts + fresh jitter for next-round tiebreaking
    for (const p of pool) heap.push(entry(p.name, p.cnt + (played.has(p.name) ? 1 : 0)));

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
 * Calculate how many rounds to generate for a fresh session.
 */
export function calculateInitialRounds(playerCount) {
  return Math.max(10, Math.ceil((playerCount * 8) / 4));
}

/**
 * Regenerate non-pinned pending matches after `afterIndex`, preserving pinned ones.
 *
 * Pinned matches (manually edited) stay in place.  The heap fills the unpinned
 * slots, accounting for players already committed in pinned matches.
 */
export function regenerateUnpinnedMatches(allMatches, afterIndex, players) {
  const pending = allMatches.slice(afterIndex + 1);
  if (!pending.length) return [];

  const unpinnedCount = pending.filter(m => !m.pinned).length;

  // Inflate virtual gamesPlayed to account for players locked into pinned matches
  const virtualPlayers = players.map(p => ({ ...p }));
  for (const m of pending.filter(m => m.pinned)) {
    for (const vp of virtualPlayers) {
      if ([...m.team1, ...m.team2].includes(vp.name)) vp.gamesPlayed++;
    }
  }

  const base = allMatches[afterIndex]?.id ?? afterIndex;
  const fresh = generateMatches(virtualPlayers, Math.max(unpinnedCount, 3), base + 1);

  // Interleave: keep pinned at their relative positions, fill gaps with fresh matches
  const result = [];
  let fi = 0;
  for (const m of pending) {
    result.push(m.pinned ? m : (fresh[fi++] ?? null));
  }

  return result.filter(Boolean).map((m, i) => ({ ...m, id: base + 1 + i }));
}
