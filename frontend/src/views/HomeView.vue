<template>
  <div>
    <!-- Create Room -->
    <div class="card">
      <div class="card-title">Create Room</div>

      <div class="field">
        <label>Your Name</label>
        <input v-model="hostName" placeholder="e.g. Alan" maxlength="20" @keydown.enter="focusPlayer" />
      </div>

      <div class="field">
        <label>Match Format</label>
      </div>
      <FormatPicker v-model="format" />

      <!-- Player list -->
      <div class="field" style="margin-top:14px;">
        <label>Players (optional — add everyone upfront)</label>
      </div>
      <div class="player-inputs">
        <div v-for="(_, i) in extraPlayers" :key="i" class="player-input-row">
          <input
            v-model="extraPlayers[i]"
            :placeholder="`Player ${i + 2}`"
            maxlength="20"
            @keydown.enter="addPlayerField"
          />
          <button class="remove-btn" @click="removePlayer(i)">✕</button>
        </div>
        <button class="btn-add-player" @click="addPlayerField">+ Add player</button>
      </div>

      <button
        class="btn btn-primary"
        style="margin-top:16px"
        :disabled="store.loading || !hostName.trim()"
        @click="submitCreate"
      >
        {{ store.loading ? 'Creating…' : 'Create Room' }}
      </button>
    </div>

    <!-- Divider -->
    <div class="divider"><span>or join an existing room</span></div>

    <!-- Join Room -->
    <div class="card">
      <div class="card-title">Join Room</div>

      <div class="field">
        <label>Room Code</label>
        <input
          v-model="joinCode"
          class="code"
          placeholder="1234"
          maxlength="4"
          inputmode="numeric"
          pattern="[0-9]*"
          @input="joinCode = joinCode.replace(/\D/g, '')"
          @keydown.enter="submitJoin"
        />
      </div>

      <div class="field">
        <label>Your Name</label>
        <input
          v-model="joinName"
          placeholder="e.g. Sarah"
          maxlength="20"
          @keydown.enter="submitJoin"
        />
      </div>

      <button
        class="btn btn-outline"
        :disabled="store.loading || joinCode.length !== 4 || !joinName.trim()"
        @click="submitJoin"
      >
        {{ store.loading ? 'Joining…' : 'Join Room' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { useRoomStore } from '../store/room.js'
import FormatPicker from '../components/FormatPicker.vue'

const store = useRoomStore()

const hostName    = ref('')
const format      = ref('doubles')
const extraPlayers = ref([])

const joinCode = ref('')
const joinName = ref('')

function addPlayerField() {
  extraPlayers.value.push('')
  nextTick(() => {
    const inputs = document.querySelectorAll('.player-input-row input')
    inputs[inputs.length - 1]?.focus()
  })
}

function removePlayer(i) {
  extraPlayers.value.splice(i, 1)
}

function focusPlayer() {
  document.querySelector('.player-input-row input')?.focus()
}

function submitCreate() {
  if (!hostName.value.trim()) return
  const additional = extraPlayers.value.map(n => n.trim()).filter(Boolean)
  store.createRoom(hostName.value.trim(), format.value, additional)
}

function submitJoin() {
  if (joinCode.value.length !== 4 || !joinName.value.trim()) return
  store.joinRoom(joinCode.value, joinName.value.trim())
}
</script>

<style scoped>
.player-inputs { display: flex; flex-direction: column; gap: 8px; }
.player-input-row { display: flex; gap: 8px; align-items: center; }
.player-input-row input {
  flex: 1;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 10px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.15s;
}
.player-input-row input:focus { border-color: var(--green); }
.remove-btn {
  width: 32px; height: 32px;
  border-radius: 50%; border: none;
  background: var(--border); color: var(--muted);
  font-size: 0.8rem; cursor: pointer; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.remove-btn:hover { background: var(--red-light); color: var(--red); }

.btn-add-player {
  background: none; border: 2px dashed var(--border);
  border-radius: 10px; padding: 9px;
  color: var(--muted); font-size: 0.85rem; font-weight: 600;
  cursor: pointer; text-align: center;
  transition: all 0.15s;
}
.btn-add-player:hover { border-color: var(--green); color: var(--green); }

.divider {
  text-align: center;
  position: relative;
  margin: 4px 0;
  color: var(--muted);
  font-size: 0.78rem;
}
.divider::before, .divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 30%;
  height: 1px;
  background: var(--border);
}
.divider::before { left: 0; }
.divider::after  { right: 0; }
</style>
