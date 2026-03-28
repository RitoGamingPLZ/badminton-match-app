<template>
  <div>
    <!-- Create Room -->
    <div class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 mb-3.5">
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

      <div class="mb-3.5">
        <label class="block text-[0.78rem] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1.5">Match Format</label>
      </div>
      <FormatPicker v-model="format" />

      <!-- Extra players -->
      <div class="mb-2">
        <label class="block text-[0.78rem] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1.5">
          Players <span class="normal-case font-normal">(optional — add everyone upfront)</span>
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

    <!-- Divider -->
    <div class="relative text-center my-1 text-[0.78rem] text-slate-500">
      <span class="relative z-10 bg-slate-50 px-3">or join an existing room</span>
      <div class="absolute inset-0 flex items-center">
        <div class="w-full border-t border-slate-200"></div>
      </div>
    </div>

    <!-- Join Room -->
    <div class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 mb-3.5">
      <div class="text-base font-bold mb-4">Join Room</div>

      <div class="mb-3.5">
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
        class="block w-full py-3.5 px-5 bg-transparent text-green-600 border-2 border-green-600 rounded-xl font-semibold text-base cursor-pointer hover:bg-green-100 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
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
const joinCode    = ref('')
const joinName    = ref('')

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
  store.createRoom(
    hostName.value.trim(),
    format.value,
    extraPlayers.value.map(n => n.trim()).filter(Boolean),
  )
}

function submitJoin() {
  if (joinCode.value.length !== 4 || !joinName.value.trim()) return
  store.joinRoom(joinCode.value, joinName.value.trim())
}
</script>
