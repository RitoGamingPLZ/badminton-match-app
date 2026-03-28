<template>
  <div>
    <!-- Room code -->
    <div class="bg-green-100 border-2 border-green-600 rounded-2xl p-5 text-center mb-3.5">
      <div class="text-[0.72rem] font-bold text-green-700 uppercase tracking-[1px] mb-1">Room Code</div>
      <div class="text-[2.8rem] font-black text-green-700 tracking-[0.2em] leading-none">{{ store.room?.code }}</div>
      <div class="text-[0.78rem] text-green-700/70 mt-1.5">Share this code with friends</div>
    </div>

    <!-- Players -->
    <div class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 mb-3.5">
      <div class="flex items-center gap-2 text-base font-bold mb-4">
        Players
        <span class="text-slate-500 font-medium text-[0.85rem]">({{ store.room?.players.length }})</span>
      </div>

      <ul class="list-none">
        <li
          v-for="(p, i) in store.room?.players"
          :key="p.name"
          class="flex items-center justify-between px-2.5 py-2.5 rounded-xl mb-1.5 bg-slate-50"
        >
          <div class="flex items-center gap-2.5">
            <div
              class="w-8 h-8 rounded-full text-white text-[0.85rem] font-bold flex items-center justify-center shrink-0"
              :style="{ background: avatarColor(p.name) }"
            >{{ p.name[0].toUpperCase() }}</div>
            <span class="font-semibold text-slate-800">{{ p.name }}</span>
          </div>
          <span v-if="i === 0" class="text-[0.7rem] font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Host</span>
        </li>
      </ul>

      <!-- Host controls -->
      <template v-if="store.isHost">
        <button
          class="mt-2 block w-full py-3.5 px-5 bg-amber-400 text-white rounded-xl font-semibold text-base cursor-pointer hover:bg-amber-500 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          :disabled="store.loading || !canStart"
          @click="store.startSession()"
        >
          {{ store.loading ? 'Generating…' : 'Generate Matches' }}
        </button>
        <p v-if="!canStart" class="text-[0.78rem] text-slate-500 mt-2 text-center">
          Need at least 4 players for doubles
        </p>
      </template>

      <!-- Non-host waiting -->
      <template v-else>
        <div class="text-center py-5 text-slate-500 text-[0.88rem]">
          <div class="mb-3">
            <span class="dot-bounce">🏸</span>
            <span class="dot-bounce dot-bounce-d1">🏸</span>
            <span class="dot-bounce dot-bounce-d2">🏸</span>
          </div>
          <p>Waiting for host to start…</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoomStore } from '../store/room.js'
import { avatarColor } from '../utils.js'

const store    = useRoomStore()
const canStart = computed(() => (store.room?.players.length ?? 0) >= 4)
</script>
