<template>
  <div>
    <!-- Room header bar -->
    <div class="room-bar">
      <div class="room-bar-code">
        <span class="room-bar-label">Room</span>
        <span class="room-bar-num">{{ store.room?.code }}</span>
      </div>
      <div class="room-bar-stats">
        <span>{{ store.doneCnt }}/{{ store.totalCnt }} done</span>
        <span class="room-bar-dot">·</span>
        <span>{{ store.room?.players.length }} players</span>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="progress-track" style="margin-bottom:16px;">
      <div class="progress-fill" :style="{ width: store.progress + '%' }"></div>
    </div>

    <!-- Current match -->
    <div v-if="store.currentMatch" class="card current-card">
      <div class="match-header">
        <div>
          <div class="match-label">Current Match</div>
          <div class="match-num">Match {{ (store.room?.currentMatchIndex ?? 0) + 1 }}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <span v-if="store.currentMatch.format === 'singles'" class="fmt-badge">1v1</span>
          <span v-else class="fmt-badge">2v2</span>
          <span v-if="store.currentMatch.pinned" class="pin-badge" title="Manually set">📌</span>
        </div>
      </div>

      <MatchCourt :match="store.currentMatch" />

      <!-- Host controls -->
      <template v-if="store.isHost">
        <div class="section-lbl" style="margin-top:16px;">Who won?</div>
        <div class="winner-row">
          <button class="btn btn-primary btn-sm" @click="store.markMatchDone(1)">
            {{ store.currentMatch.team1.join(' & ') }}
          </button>
          <button class="btn btn-outline btn-sm" @click="store.markMatchDone(2)">
            {{ store.currentMatch.team2.join(' & ') }}
          </button>
        </div>

        <div class="action-row">
          <button class="action-btn" @click="store.skipMatch()" title="Skip this match">
            <span class="action-icon">⏭</span>Skip
          </button>
          <button class="action-btn" :disabled="!store.canUndo" @click="store.undo()" title="Undo last action">
            <span class="action-icon">↩</span>Undo
          </button>
          <button class="action-btn" @click="store.openEditMatches()" title="Edit matches">
            <span class="action-icon">✏️</span>Edit
          </button>
          <button class="action-btn" @click="showHistory = !showHistory" :class="{ active: showHistory }" title="Operation history">
            <span class="action-icon">📋</span>History
          </button>
        </div>
      </template>

      <p v-else style="text-align:center;color:var(--muted);font-size:0.82rem;margin-top:12px;">
        Waiting for host to record result…
      </p>
    </div>

    <!-- All done -->
    <div v-if="!store.currentMatch" class="card">
      <div class="empty">
        <span class="empty-icon">🏆</span>
        <strong>All matches complete!</strong>
        <p style="margin-top:8px;color:var(--muted);">Great session everyone!</p>
      </div>
    </div>

    <!-- Operation history panel -->
    <Transition name="slide">
      <div v-if="showHistory" class="card history-card">
        <div class="card-title">Operation History</div>
        <div v-if="store.opLog.length === 0" class="empty" style="padding:16px 0;">
          <span style="color:var(--muted);font-size:0.85rem;">No operations yet</span>
        </div>
        <ul v-else class="history-list">
          <li
            v-for="(entry, i) in [...store.opLog].reverse()"
            :key="i"
            class="history-item"
            :class="entry.type"
          >
            <span class="history-icon">{{ historyIcon(entry.type) }}</span>
            <div class="history-body">
              <div class="history-desc">{{ entry.description }}</div>
              <div class="history-time">{{ formatTime(entry.ts) }}</div>
            </div>
          </li>
        </ul>
      </div>
    </Transition>

    <!-- Upcoming matches -->
    <div v-if="store.upcomingMatches.length" class="card" style="padding:14px;">
      <div class="card-title">
        Upcoming
        <span class="count-badge">{{ store.upcomingMatches.length }}</span>
      </div>
      <div class="scroll-list">
        <div
          v-for="(m, i) in store.upcomingMatches"
          :key="m.id"
          class="upcoming-row"
        >
          <div class="upcoming-num">
            #{{ (store.room?.currentMatchIndex ?? 0) + 2 + i }}
            <span v-if="m.pinned" class="pin-sm" title="Manually set">📌</span>
          </div>
          <div class="upcoming-court">
            <span class="upcoming-team">{{ m.team1.join(' & ') }}</span>
            <span class="upcoming-vs">vs</span>
            <span class="upcoming-team">{{ m.team2.join(' & ') }}</span>
          </div>
          <span v-if="m.format === 'singles'" class="fmt-badge-sm">1v1</span>
        </div>
      </div>
    </div>

    <!-- Add more / Finish -->
    <div v-if="store.isHost" class="card" style="padding:14px;">
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" style="flex:1" @click="store.addMatches(5)">
          + 5 Matches
        </button>
        <button class="btn btn-danger btn-sm" style="flex:1" @click="showFinish = true">
          Finish Game
        </button>
      </div>
    </div>

    <!-- Finish confirmation -->
    <Transition name="modal">
      <div v-if="showFinish" class="modal-overlay" @click.self="showFinish = false">
        <div class="modal-sheet">
          <div class="modal-title">Finish Game?</div>
          <p style="color:var(--muted);font-size:0.88rem;margin-bottom:20px;">
            This will end the session and return everyone to the home screen.
          </p>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-secondary btn-sm" style="flex:1" @click="showFinish = false">Cancel</button>
            <button class="btn btn-danger btn-sm" style="flex:1" @click="store.leaveRoom()">End Session</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoomStore } from '../store/room.js'
import MatchCourt from '../components/MatchCourt.vue'

const store = useRoomStore()

const showHistory = ref(false)
const showFinish  = ref(false)

function historyIcon(type) {
  if (type === 'match_done')    return '✅'
  if (type === 'match_skipped') return '⏭'
  if (type === 'match_edited')  return '✏️'
  return '•'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
/* ── Room header bar ───────────────────────────────────────────────────────── */
.room-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--green-light);
  border: 2px solid var(--green);
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 10px;
}
.room-bar-code { display: flex; align-items: baseline; gap: 6px; }
.room-bar-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--green-dark); letter-spacing: 1px; }
.room-bar-num { font-size: 1.6rem; font-weight: 900; color: var(--green-dark); letter-spacing: 0.15em; line-height: 1; }
.room-bar-stats { font-size: 0.78rem; color: var(--green-dark); font-weight: 500; }
.room-bar-dot { margin: 0 4px; }

/* ── Current match card ──────────────────────────────────────────────────── */
.current-card { border: 2px solid var(--amber); background: var(--amber-light); }
.match-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.match-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--amber); margin-bottom: 2px; }
.match-num { font-size: 1.1rem; font-weight: 800; color: var(--text); }

.pin-badge { font-size: 0.85rem; }

/* ── Winner row ──────────────────────────────────────────────────────────── */
.winner-row { display: flex; gap: 8px; margin-top: 8px; }
.winner-row .btn { flex: 1; }

/* ── Action row ──────────────────────────────────────────────────────────── */
.action-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 12px;
}
.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 4px;
  border-radius: 10px;
  border: 2px solid var(--border);
  background: white;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;
}
.action-btn:hover:not(:disabled) { border-color: var(--green); color: var(--green); background: var(--green-light); }
.action-btn.active { border-color: var(--green); color: var(--green); background: var(--green-light); }
.action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.action-icon { font-size: 1.1rem; }

/* ── History panel ───────────────────────────────────────────────────────── */
.history-card { background: var(--bg); box-shadow: none; border: 2px solid var(--border); }
.history-list { list-style: none; display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; }
.history-item { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; background: white; }
.history-item.match_done    { border-left: 3px solid var(--green); }
.history-item.match_skipped { border-left: 3px solid var(--amber); }
.history-item.match_edited  { border-left: 3px solid var(--blue); }
.history-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
.history-body { flex: 1; min-width: 0; }
.history-desc { font-size: 0.82rem; font-weight: 500; color: var(--text); }
.history-time { font-size: 0.7rem; color: var(--muted); margin-top: 2px; }

/* ── Upcoming list ───────────────────────────────────────────────────────── */
.upcoming-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 8px;
  background: var(--bg);
  margin-bottom: 6px;
}
.upcoming-num { font-size: 0.7rem; font-weight: 700; color: var(--muted); min-width: 28px; }
.upcoming-court { display: flex; align-items: center; gap: 6px; flex: 1; font-size: 0.85rem; font-weight: 600; }
.upcoming-vs { color: var(--muted); font-size: 0.75rem; }
.upcoming-team { color: var(--text); }
.fmt-badge-sm { font-size: 0.65rem; font-weight: 600; padding: 2px 7px; border-radius: 20px; background: var(--blue-light); color: var(--blue); flex-shrink: 0; }
.pin-sm { font-size: 0.7rem; margin-left: 2px; }

/* ── Count badge ─────────────────────────────────────────────────────────── */
.count-badge {
  background: var(--border);
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  margin-left: auto;
}

/* ── Danger button ───────────────────────────────────────────────────────── */
.btn-danger {
  background: var(--red-light);
  color: var(--red);
  border: 2px solid var(--red);
}
.btn-danger:hover { background: var(--red); color: white; }

/* ── Slide transition ────────────────────────────────────────────────────── */
.slide-enter-active, .slide-leave-active { transition: all 0.25s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to { opacity: 0; max-height: 0; margin-bottom: 0; }
.slide-enter-to, .slide-leave-from { max-height: 400px; }
</style>
