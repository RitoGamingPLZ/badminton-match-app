<template>
  <div>
    <!-- Back header -->
    <div class="back-bar">
      <button class="back-btn" @click="store.closeEditMatches()">← Back</button>
      <div class="back-title">Edit Matches</div>
    </div>

    <p class="hint-text" style="margin-bottom:14px;">
      Edited matches are pinned — they stay in place when the schedule regenerates.
    </p>

    <!-- Match list -->
    <div v-if="store.editableMatches.length === 0" class="card">
      <div class="empty">
        <span class="empty-icon">✓</span>
        No active or upcoming matches to edit.
      </div>
    </div>

    <div
      v-for="m in store.editableMatches"
      :key="m.index"
      class="card match-edit-card"
      :class="{ active: m.status === 'active' }"
    >
      <!-- Match row header -->
      <div class="match-edit-header" @click="toggleExpand(m.index)">
        <div class="match-edit-left">
          <div class="match-edit-num">
            Match {{ m.index + 1 }}
            <span v-if="m.status === 'active'" class="badge-active">Playing</span>
            <span v-if="m.pinned" class="pin-badge">📌</span>
          </div>
          <div class="match-edit-teams">
            {{ m.team1.join(' & ') }} <span class="vs-small">vs</span> {{ m.team2.join(' & ') }}
          </div>
        </div>
        <span class="expand-icon">{{ expandedIndex === m.index ? '▲' : '▼' }}</span>
      </div>

      <!-- Inline editor -->
      <Transition name="expand">
        <div v-if="expandedIndex === m.index" class="editor">
          <div class="section-lbl" style="margin-top:4px;">Team 1</div>
          <div class="player-grid">
            <div
              v-for="p in store.room.players"
              :key="'t1-' + p.name"
              class="pick-btn"
              :class="{
                selected: editTeam1.includes(p.name),
                disabled: editTeam2.includes(p.name),
              }"
              @click="toggle('team1', p.name, teamSize(m))"
            >
              <div class="avatar sm" :style="{ background: avatarColor(p.name) }">
                {{ p.name[0].toUpperCase() }}
              </div>
              <span>{{ p.name }}</span>
              <span v-if="editTeam1.includes(p.name)" class="check">✓</span>
            </div>
          </div>

          <div class="section-lbl" style="margin-top:12px;">Team 2</div>
          <div class="player-grid">
            <div
              v-for="p in store.room.players"
              :key="'t2-' + p.name"
              class="pick-btn"
              :class="{
                selected: editTeam2.includes(p.name),
                disabled: editTeam1.includes(p.name),
              }"
              @click="toggle('team2', p.name, teamSize(m))"
            >
              <div class="avatar sm" :style="{ background: avatarColor(p.name) }">
                {{ p.name[0].toUpperCase() }}
              </div>
              <span>{{ p.name }}</span>
              <span v-if="editTeam2.includes(p.name)" class="check">✓</span>
            </div>
          </div>

          <p class="regen-note">
            Pending matches after this one will be regenerated to maintain fairness,
            keeping other pinned matches in place.
          </p>

          <div class="editor-actions">
            <button class="btn btn-secondary btn-sm" @click="cancelEdit()">Cancel</button>
            <button
              class="btn btn-primary btn-sm"
              :disabled="!isValid(m) || saving"
              @click="saveEdit(m)"
            >
              {{ saving ? 'Saving…' : 'Save & Regenerate' }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoomStore } from '../store/room.js'
import { avatarColor } from '../utils.js'

const store = useRoomStore()

const expandedIndex = ref(null)
const editTeam1 = ref([])
const editTeam2 = ref([])
const saving = ref(false)

function teamSize(m) {
  return m.format === 'singles' ? 1 : 2
}

function toggleExpand(idx) {
  if (expandedIndex.value === idx) {
    expandedIndex.value = null
    return
  }
  const m = store.editableMatches.find(m => m.index === idx)
  if (!m) return
  editTeam1.value = [...m.team1]
  editTeam2.value = [...m.team2]
  expandedIndex.value = idx
}

function cancelEdit() {
  expandedIndex.value = null
}

function toggle(side, name, size) {
  const t     = side === 'team1' ? editTeam1 : editTeam2
  const other = side === 'team1' ? editTeam2 : editTeam1
  if (other.value.includes(name)) return
  if (t.value.includes(name)) {
    t.value = t.value.filter(n => n !== name)
  } else if (t.value.length < size) {
    t.value = [...t.value, name]
  }
}

function isValid(m) {
  const size = teamSize(m)
  return (
    editTeam1.value.length === size &&
    editTeam2.value.length === size &&
    new Set([...editTeam1.value, ...editTeam2.value]).size === size * 2
  )
}

async function saveEdit(m) {
  if (!isValid(m)) return
  saving.value = true
  await store.editMatch(m.index, [...editTeam1.value], [...editTeam2.value])
  saving.value = false
  expandedIndex.value = null
}
</script>

<style scoped>
.back-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.back-btn {
  background: none;
  border: 2px solid var(--border);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  flex-shrink: 0;
}
.back-btn:hover { border-color: var(--green); color: var(--green); }
.back-title { font-size: 1.1rem; font-weight: 800; }

.hint-text { font-size: 0.8rem; color: var(--muted); }

/* ── Match card ──────────────────────────────────────────────────────────── */
.match-edit-card { padding: 14px; }
.match-edit-card.active { border: 2px solid var(--amber); background: var(--amber-light); }

.match-edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}
.match-edit-left { flex: 1; }
.match-edit-num {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.match-edit-teams {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text);
}
.vs-small { color: var(--muted); font-size: 0.78rem; margin: 0 4px; }
.expand-icon { font-size: 0.7rem; color: var(--muted); }
.badge-active { background: var(--amber); color: white; font-size: 0.65rem; padding: 2px 7px; border-radius: 20px; }
.pin-badge { font-size: 0.8rem; }

/* ── Inline editor ───────────────────────────────────────────────────────── */
.editor { padding-top: 14px; border-top: 2px solid var(--border); margin-top: 12px; }

.player-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pick-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 2px solid var(--border);
  background: white;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
  transition: all 0.15s;
  position: relative;
}
.pick-btn.selected { border-color: var(--green); background: var(--green-light); }
.pick-btn.disabled { opacity: 0.35; cursor: not-allowed; }
.avatar.sm { width: 28px; height: 28px; font-size: 0.75rem; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.check { margin-left: auto; color: var(--green); font-weight: 800; }

.regen-note {
  font-size: 0.76rem;
  color: var(--muted);
  margin-top: 12px;
  padding: 8px 10px;
  background: var(--bg);
  border-radius: 8px;
}

.editor-actions { display: flex; gap: 10px; margin-top: 14px; }
.editor-actions .btn { flex: 1; }

/* ── Expand transition ───────────────────────────────────────────────────── */
.expand-enter-active, .expand-leave-active { transition: all 0.2s ease; overflow: hidden; }
.expand-enter-from, .expand-leave-to { opacity: 0; max-height: 0; padding-top: 0; margin-top: 0; }
.expand-enter-to, .expand-leave-from { max-height: 600px; }
</style>
