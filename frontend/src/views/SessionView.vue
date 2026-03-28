<template>
  <div>
    <!-- Progress stats -->
    <div class="card" style="padding:14px;">
      <div class="stat-row">
        <div class="stat">
          <div class="stat-val">{{ store.room?.players.length }}</div>
          <div class="stat-lbl">Players</div>
        </div>
        <div class="stat">
          <div class="stat-val">{{ store.doneCnt }}</div>
          <div class="stat-lbl">Done</div>
        </div>
        <div class="stat">
          <div class="stat-val">{{ store.totalCnt }}</div>
          <div class="stat-lbl">Total</div>
        </div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: store.progress + '%' }"></div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button v-for="t in tabs" :key="t.id" class="tab" :class="{ active: activeTab === t.id }" @click="activeTab = t.id">
        {{ t.label }}
      </button>
    </div>

    <!-- ⚡ Current match tab -->
    <template v-if="activeTab === 'current'">
      <div v-if="store.currentMatch" class="card">
        <div class="card-title" style="margin-bottom:12px;">
          ⚡ Match {{ (store.room?.currentMatchIndex ?? 0) + 1 }}
          <span
            v-if="store.currentMatch.format === 'singles'"
            class="fmt-badge"
            style="margin-left:auto"
          >1v1</span>
          <span v-else class="status-badge active" style="margin-left:auto">2v2</span>
        </div>

        <MatchCourt :match="store.currentMatch" />

        <!-- Host: winner buttons -->
        <template v-if="store.isHost">
          <div class="section-lbl" style="margin-top:14px;">Who won?</div>
          <div class="winner-row">
            <button class="btn btn-primary btn-sm" @click="store.markMatchDone(1)">
              🏆 {{ store.currentMatch.team1.join(' & ') }}
            </button>
            <button class="btn btn-outline btn-sm" @click="store.markMatchDone(2)">
              🏆 {{ store.currentMatch.team2.join(' & ') }}
            </button>
          </div>

          <button
            class="btn btn-secondary btn-sm"
            style="margin-top:8px;width:100%"
            @click="showEdit = true"
          >
            ✏️ Edit This Match
          </button>
        </template>

        <p v-else style="text-align:center;color:var(--muted);font-size:0.82rem;margin-top:10px;">
          Waiting for host to record result…
        </p>
      </div>

      <!-- Up next -->
      <div v-if="store.nextMatch" class="card" style="padding:14px;background:var(--bg);box-shadow:none;border:2px solid var(--border);">
        <div class="section-lbl" style="margin-bottom:8px;">
          ⏭ Up Next — Match {{ (store.room?.currentMatchIndex ?? 0) + 2 }}
        </div>
        <MatchCourt :match="store.nextMatch" />
      </div>

      <!-- All done -->
      <div v-if="!store.currentMatch" class="card">
        <div class="empty">
          <span class="empty-icon">🏆</span>
          <strong>All matches complete!</strong>
          <p style="margin-top:8px;">Great session everyone!</p>
        </div>
      </div>

      <!-- Host: add more matches -->
      <div v-if="store.isHost" class="card" style="padding:14px;">
        <div class="section-lbl">Host Controls</div>
        <button class="btn btn-outline btn-sm" style="width:100%;margin-top:6px;" @click="store.addMatches(5)">
          ➕ Add 5 More Matches
        </button>
      </div>
    </template>

    <!-- 📋 Schedule tab -->
    <template v-if="activeTab === 'schedule'">
      <div class="card" style="padding:14px;">
        <div class="card-title">📋 All Matches</div>
        <div class="scroll-list">
          <div
            v-for="(m, i) in store.room?.matches"
            :key="m.id"
            class="match-card"
            :class="m.status"
          >
            <div class="match-head">
              <span class="match-num">Match {{ i + 1 }}</span>
              <div style="display:flex;gap:5px;align-items:center;">
                <span v-if="m.format === 'singles'" class="fmt-badge">1v1</span>
                <span class="status-badge" :class="m.status">
                  {{ statusLabel(m.status) }}
                </span>
              </div>
            </div>
            <MatchCourt :match="m" />
            <p v-if="m.winner" style="font-size:0.75rem;color:var(--green);margin-top:6px;font-weight:600;">
              🏆 Team {{ m.winner }} won
            </p>
          </div>
          <div v-if="!store.room?.matches.length" class="empty">
            <span class="empty-icon">📋</span>No matches yet
          </div>
        </div>
      </div>
    </template>

    <!-- 🏅 Players tab -->
    <template v-if="activeTab === 'players'">
      <div class="card">
        <div class="card-title">🏅 Leaderboard</div>
        <ul class="player-list">
          <li
            v-for="(p, i) in sortedPlayers"
            :key="p.name"
            class="player-item"
          >
            <div class="player-left">
              <div class="avatar" :style="{ background: avatarColor(p.name) }">
                {{ p.name[0].toUpperCase() }}
              </div>
              <div>
                <div style="font-weight:600">{{ p.name }}</div>
                <div style="font-size:0.73rem;color:var(--muted)">
                  {{ p.gamesPlayed }} game{{ p.gamesPlayed !== 1 ? 's' : '' }} played
                </div>
              </div>
            </div>
            <span v-if="i === 0 && p.gamesPlayed > 0" style="font-size:1.2rem">🥇</span>
          </li>
        </ul>
      </div>
    </template>

    <!-- Edit match modal -->
    <Transition name="modal">
      <EditMatchModal
        v-if="showEdit && store.currentMatch"
        :match="store.currentMatch"
        :players="store.room?.players ?? []"
        @confirm="onEditConfirm"
        @cancel="showEdit = false"
      />
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoomStore } from '../store/room.js'
import MatchCourt from '../components/MatchCourt.vue'
import EditMatchModal from '../components/EditMatchModal.vue'
import { avatarColor } from '../utils.js'

const store = useRoomStore()
const activeTab = ref('current')
const showEdit = ref(false)

const tabs = [
  { id: 'current',  label: '⚡ Current'  },
  { id: 'schedule', label: '📋 Schedule' },
  { id: 'players',  label: '🏅 Players'  },
]

const sortedPlayers = computed(() =>
  [...(store.room?.players ?? [])].sort((a, b) => b.gamesPlayed - a.gamesPlayed)
)

function statusLabel(s) {
  if (s === 'active') return '▶ Playing'
  if (s === 'done') return '✓ Done'
  return 'Upcoming'
}

async function onEditConfirm({ team1, team2 }) {
  showEdit.value = false
  await store.editMatch(team1, team2)
}
</script>

<style scoped>
.winner-row { display: flex; gap: 8px; margin-top: 8px; }
.winner-row .btn { flex: 1; }
</style>
