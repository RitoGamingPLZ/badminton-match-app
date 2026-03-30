<template>
  <div>
    <!-- Room bar -->
    <div class="flex items-center justify-between bg-green-100 border-2 border-green-600 rounded-xl px-3.5 py-2.5 mb-2.5">
      <div class="flex items-baseline gap-1.5">
        <span class="text-[0.7rem] font-bold text-green-700 uppercase tracking-[1px]">Room</span>
        <span class="text-[1.6rem] font-black text-green-700 tracking-[0.15em] leading-none">{{ store.room?.code }}</span>
      </div>
      <div class="text-[0.78rem] text-green-700 font-medium">
        {{ store.doneCnt }}/{{ store.totalCnt }} done · {{ store.room?.players.length }} players
      </div>
    </div>

    <!-- Progress bar -->
    <div class="bg-slate-200 rounded-full h-1.5 overflow-hidden mb-4">
      <div class="progress-fill rounded-full" :style="{ width: store.progress + '%' }"></div>
    </div>

    <!-- Current match -->
    <div v-if="store.currentMatch" class="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 mb-3.5">
      <div class="flex items-start justify-between mb-3">
        <div>
          <div class="text-[0.7rem] font-bold uppercase tracking-[0.8px] text-amber-500 mb-0.5">Current Match</div>
          <div class="text-[1.1rem] font-extrabold text-slate-800">
            Match {{ (store.room?.currentMatchIndex ?? 0) + 1 }}
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[0.7rem] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-500">2v2</span>
          <span v-if="store.currentMatch.pinned" title="Manually set">📌</span>
        </div>
      </div>

      <MatchCourt
        :match="store.currentMatch"
        :editable="store.isHost"
        :players="store.room?.players ?? []"
        @save="onCourtSave"
      />

      <!-- Host controls -->
      <template v-if="store.isHost">
        <!-- Skip a player -->
        <div class="text-[0.72rem] font-bold uppercase tracking-[0.8px] text-slate-500 mt-4 mb-1.5">Skip a player</div>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="name in currentMatchPlayers"
            :key="name"
            class="flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-xl border-2 border-slate-200 bg-white text-[0.7rem] font-semibold text-slate-500 cursor-pointer transition-all hover:border-amber-500 hover:text-amber-600 hover:bg-amber-50 active:scale-[0.97]"
            @click="store.skipMatch(name)"
          >
            <span class="text-[1.1rem]">⏭</span>
            <span class="truncate w-full text-center">{{ name }}</span>
          </button>
        </div>

        <button
          class="w-full mt-4 py-3 bg-green-600 text-white rounded-xl font-bold text-[0.95rem] cursor-pointer hover:bg-green-700 active:scale-[0.98] transition-all"
          @click="store.markMatchDone(null)"
        >Next Match →</button>

        <!-- Action buttons -->
        <div class="grid grid-cols-3 gap-1.5 mt-3">
          <button
            v-for="a in actions"
            :key="a.label"
            class="flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-xl border-2 border-slate-200 bg-white text-[0.7rem] font-semibold text-slate-500 cursor-pointer transition-all hover:border-green-600 hover:text-green-600 hover:bg-green-50 disabled:opacity-35 disabled:cursor-not-allowed"
            :class="{ 'border-green-600 text-green-600 bg-green-50': a.active }"
            :disabled="a.disabled"
            @click="a.action"
          >
            <span class="text-[1.1rem]">{{ a.icon }}</span>
            {{ a.label }}
          </button>
        </div>
      </template>

      <p v-else class="text-center text-slate-500 text-[0.82rem] mt-3">
        Waiting for host to record result…
      </p>
    </div>

    <!-- All done -->
    <div v-if="!store.currentMatch" class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 mb-3.5 text-center py-8">
      <span class="block text-[2.5rem] mb-2">🏆</span>
      <strong class="text-slate-800">All matches complete!</strong>
      <p class="text-slate-500 text-[0.88rem] mt-2">Great session everyone!</p>
    </div>

    <!-- History panel -->
    <Transition name="slide">
      <div v-if="showHistory" class="bg-slate-50 border-2 border-slate-200 rounded-2xl p-5 mb-3.5">
        <div class="text-base font-bold mb-3">Operation History</div>
        <div v-if="!store.opLog.length" class="text-slate-500 text-[0.85rem] text-center py-4">No operations yet</div>
        <ul v-else class="list-none flex flex-col gap-2 max-h-56 overflow-y-auto">
          <li
            v-for="(e, i) in [...store.opLog].reverse()"
            :key="i"
            class="flex gap-2.5 items-start p-2.5 rounded-lg bg-white border-l-4"
            :class="{
              'border-green-600': e.type === 'match_done',
              'border-amber-400': e.type === 'match_skipped',
              'border-blue-500':  e.type === 'match_edited',
            }"
          >
            <span class="text-base shrink-0 mt-px">{{ historyIcon(e.type) }}</span>
            <div class="flex-1 min-w-0">
              <div class="text-[0.82rem] font-medium text-slate-800">{{ e.description }}</div>
              <div class="text-[0.7rem] text-slate-500 mt-0.5">{{ formatTime(e.ts) }}</div>
            </div>
          </li>
        </ul>
      </div>
    </Transition>

    <!-- Upcoming matches -->
    <div v-if="store.upcomingMatches.length" class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-3.5 mb-3.5">
      <div class="flex items-center gap-2 text-base font-bold mb-3">
        Upcoming
        <span class="ml-auto bg-slate-200 text-slate-500 text-[0.7rem] font-bold px-2 py-0.5 rounded-full">
          {{ store.upcomingMatches.length }}
        </span>
      </div>
      <div class="max-h-[42vh] overflow-y-auto">
        <div
          v-for="(m, i) in store.upcomingMatches"
          :key="m.id"
          class="flex items-center gap-2.5 px-2 py-2.5 rounded-lg bg-slate-50 mb-1.5"
        >
          <div class="text-[0.7rem] font-bold text-slate-500 min-w-[28px]">
            #{{ (store.room?.currentMatchIndex ?? 0) + 2 + i }}
            <span v-if="m.pinned">📌</span>
          </div>
          <div class="flex items-center gap-1.5 flex-1 text-[0.85rem] font-semibold text-slate-800">
            {{ m.team1.join(' & ') }}
            <span class="text-slate-400 text-[0.75rem]">vs</span>
            {{ m.team2.join(' & ') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Host footer -->
    <div v-if="store.isHost" class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-3.5 mb-3.5">
      <div class="flex gap-2">
        <button
          class="flex-1 py-2.5 px-4 bg-slate-200 text-slate-800 rounded-lg font-semibold text-[0.85rem] cursor-pointer hover:bg-slate-300 transition-colors"
          @click="store.addMatches(5)"
        >+ 5 Matches</button>
        <button
          class="flex-1 py-2.5 px-4 bg-red-100 text-red-500 border-2 border-red-500 rounded-lg font-semibold text-[0.85rem] cursor-pointer hover:bg-red-500 hover:text-white transition-colors"
          @click="showFinish = true"
        >Finish Game</button>
      </div>
    </div>

    <!-- Finish confirmation modal -->
    <Transition name="modal">
      <div v-if="showFinish" class="modal-overlay fixed inset-0 bg-black/45 z-[500] flex items-end justify-center">
        <div class="modal-sheet bg-white rounded-t-3xl w-full max-w-[480px] max-h-[90vh] overflow-y-auto px-5 pt-6 pb-8">
          <div class="text-[1.1rem] font-bold mb-3">Finish Game?</div>
          <p class="text-slate-500 text-[0.88rem] mb-5">
            This will end the session and return everyone to the home screen.
          </p>
          <div class="flex gap-2.5">
            <button
              class="flex-1 py-2.5 px-4 bg-slate-200 text-slate-800 rounded-lg font-semibold text-[0.85rem] cursor-pointer hover:bg-slate-300 transition-colors"
              @click="showFinish = false"
            >Cancel</button>
            <button
              class="flex-1 py-2.5 px-4 bg-red-500 text-white rounded-lg font-semibold text-[0.85rem] cursor-pointer hover:bg-red-600 transition-colors"
              @click="store.leaveRoom()"
            >End Session</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoomStore } from '../store/room.js'
import MatchCourt from '../components/MatchCourt.vue'

const store = useRoomStore()

const showHistory = ref(false)
const showFinish  = ref(false)

const currentMatchPlayers = computed(() => {
  const m = store.currentMatch
  if (!m) return []
  return [...m.team1, ...m.team2]
})

const actions = computed(() => [
  {
    icon: '↩', label: 'Undo',
    action: () => store.undo(),
    disabled: !store.canUndo, active: false,
  },
  {
    icon: '✏️', label: 'Edit',
    action: () => store.openEditMatches(),
    disabled: false, active: false,
  },
  {
    icon: '📋', label: 'History',
    action: () => { showHistory.value = !showHistory.value },
    disabled: false, active: showHistory.value,
  },
])

async function onCourtSave(team1, team2) {
  await store.editMatch(store.room.currentMatchIndex, team1, team2)
}

function historyIcon(type) {
  if (type === 'match_done')    return '✅'
  if (type === 'match_skipped') return '⏭'
  if (type === 'match_edited')  return '✏️'
  return '•'
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>
