<template>
  <div>
    <Transition name="fade" mode="out-in">

      <!-- ── Home: join fields + create button ───────────────────────────── -->
      <div v-if="!activeForm" key="home" class="pt-6">
        <div class="text-center mb-6">
          <span class="text-2xl">🏸</span>
          <div class="text-lg font-bold text-slate-700 mt-1">Badminton Match</div>
        </div>

        <!-- Room code -->
        <div class="mb-3">
          <label class="block text-[0.78rem] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1.5">Room Code</label>
          <input
            v-model="joinCode"
            class="w-full px-3.5 py-3 border-2 border-slate-200 rounded-xl text-base text-slate-800 bg-white outline-none focus:border-green-600 transition-colors input-code"
            placeholder="1234"
            maxlength="4"
            inputmode="numeric"
            pattern="[0-9]*"
            @input="joinCode = joinCode.replace(/\D/g, '')"
            @keydown.enter="submitJoin"
          />
        </div>

        <!-- Your name (for join) -->
        <div class="mb-3.5">
          <label class="block text-[0.78rem] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1.5">Your Name</label>
          <input
            v-model="joinName"
            class="w-full px-3.5 py-3 border-2 border-slate-200 rounded-xl text-base text-slate-800 bg-white outline-none focus:border-green-600 transition-colors"
            placeholder="e.g. Sarah"
            maxlength="20"
            @keydown.enter="submitJoin"
          />
        </div>

        <button
          class="block w-full py-3.5 px-5 bg-green-600 text-white rounded-xl font-semibold text-base cursor-pointer hover:bg-green-700 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          :disabled="store.loading || joinCode.length !== 4 || !joinName.trim()"
          @click="submitJoin"
        >
          {{ store.loading ? 'Joining…' : 'Join Room' }}
        </button>

        <!-- Divider -->
        <div class="relative text-center my-5 text-[0.78rem] text-slate-400">
          <span class="relative z-10 bg-slate-50 px-3">or</span>
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-slate-200"></div>
          </div>
        </div>

        <button
          class="block w-full py-3.5 px-5 bg-white text-slate-600 border-2 border-slate-200 rounded-xl font-semibold text-base cursor-pointer hover:border-green-600 hover:text-green-600 active:scale-[0.97] transition-all"
          @click="openCreate"
        >
          Create Room
        </button>
      </div>

      <!-- ── Create Room form (fade in) ──────────────────────────────────── -->
      <div v-else key="create">
        <button
          class="mb-4 flex items-center gap-1.5 text-[0.85rem] font-semibold text-slate-500 hover:text-slate-700 transition-colors bg-transparent border-none cursor-pointer p-0"
          @click="activeForm = null"
        >
          ← Back
        </button>

        <div class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5">
          <div class="text-base font-bold mb-4">Create Room</div>

          <div class="mb-3.5">
            <label class="block text-[0.78rem] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1.5">Your Name</label>
            <input
              v-model="hostName"
              class="w-full px-3.5 py-3 border-2 border-slate-200 rounded-xl text-base text-slate-800 bg-white outline-none focus:border-green-600 transition-colors"
              placeholder="e.g. Alan"
              maxlength="20"
              @keydown.enter="focusPlayerInput"
            />
          </div>

          <div class="mb-2">
            <label class="block text-[0.78rem] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1.5">
              Players <span class="normal-case font-normal">(optional)</span>
            </label>
          </div>
          <div class="flex flex-col gap-2">
            <div v-for="(_, i) in extraPlayers" :key="i" class="flex gap-2 items-center">
              <input
                v-model="extraPlayers[i]"
                class="flex-1 px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-[0.95rem] text-slate-800 bg-white outline-none focus:border-green-600 transition-colors player-input"
                :placeholder="`Player ${i + 2}`"
                maxlength="20"
                @keydown.enter="addPlayerField"
              />
              <button
                class="w-8 h-8 rounded-full border-none bg-slate-200 text-slate-500 text-[0.8rem] cursor-pointer flex items-center justify-center shrink-0 hover:bg-red-100 hover:text-red-500 transition-colors"
                @click="removePlayer(i)"
              >✕</button>
            </div>
            <button
              class="border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-[0.85rem] font-semibold text-slate-500 cursor-pointer bg-transparent text-center hover:border-green-600 hover:text-green-600 transition-colors"
              @click="addPlayerField"
            >+ Add player</button>
          </div>

          <button
            class="mt-4 block w-full py-3.5 px-5 bg-green-600 text-white rounded-xl font-semibold text-base cursor-pointer hover:bg-green-700 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            :disabled="store.loading || !hostName.trim()"
            @click="submitCreate"
          >
            {{ store.loading ? 'Creating…' : 'Create Room' }}
          </button>
        </div>
      </div>

    </Transition>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { useRoomStore } from '../store/room.js'

const store = useRoomStore()

const activeForm   = ref(null)
const hostName     = ref('')
const extraPlayers = ref([])
const joinCode     = ref('')
const joinName     = ref('')

const STORAGE_KEY = 'bma_last_players'

function openCreate() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const { name, players } = JSON.parse(saved)
      hostName.value     = name    ?? ''
      extraPlayers.value = players ?? []
    } catch {}
  }
  activeForm.value = 'create'
}

function addPlayerField() {
  extraPlayers.value.push('')
  nextTick(() => {
    const inputs = document.querySelectorAll('.player-input')
    inputs[inputs.length - 1]?.focus()
  })
}

function removePlayer(i) { extraPlayers.value.splice(i, 1) }
function focusPlayerInput() { document.querySelector('.player-input')?.focus() }

function submitCreate() {
  if (!hostName.value.trim()) return
  const name    = hostName.value.trim()
  const players = extraPlayers.value.map(n => n.trim()).filter(Boolean)
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, players }))
  store.createRoom(name, players)
}

function submitJoin() {
  if (joinCode.value.length !== 4 || !joinName.value.trim()) return
  store.joinRoom(joinCode.value, joinName.value.trim())
}
</script>
