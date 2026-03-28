<template>
  <div>
    <!-- Back bar -->
    <div class="flex items-center gap-3 mb-3">
      <button
        class="border-2 border-slate-200 rounded-lg px-3 py-1.5 text-[0.85rem] font-semibold text-slate-800 cursor-pointer hover:border-green-600 hover:text-green-600 transition-colors bg-transparent shrink-0"
        @click="store.closeEditMatches()"
      >← Back</button>
      <div class="text-[1.1rem] font-extrabold text-slate-800">Edit Matches</div>
    </div>

    <p class="text-[0.8rem] text-slate-500 mb-3.5">
      Edited matches are pinned (📌) — they stay in place when the schedule regenerates.
    </p>

    <div v-if="!store.editableMatches.length" class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 text-center py-8 text-slate-500 text-[0.88rem]">
      No active or upcoming matches to edit.
    </div>

    <div
      v-for="m in store.editableMatches"
      :key="m.index"
      class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-3.5 mb-3.5 border-2 transition-colors"
      :class="m.status === 'active' ? 'border-amber-400 bg-amber-50' : 'border-transparent'"
    >
      <!-- Header row -->
      <div class="flex items-center justify-between cursor-pointer select-none" @click="toggleExpand(m.index)">
        <div class="flex-1">
          <div class="flex items-center gap-1.5 text-[0.72rem] font-bold uppercase tracking-[0.5px] text-slate-500 mb-0.5">
            Match {{ m.index + 1 }}
            <span v-if="m.status === 'active'" class="bg-amber-400 text-white text-[0.65rem] px-2 py-0.5 rounded-full">Playing</span>
            <span v-if="m.pinned">📌</span>
          </div>
          <div class="text-[0.92rem] font-semibold text-slate-800">
            {{ m.team1.join(' & ') }} <span class="text-slate-400 text-[0.78rem] mx-1">vs</span> {{ m.team2.join(' & ') }}
          </div>
        </div>
        <span class="text-[0.7rem] text-slate-400 ml-2">{{ expandedIndex === m.index ? '▲' : '▼' }}</span>
      </div>

      <!-- Inline editor -->
      <Transition name="expand">
        <div v-if="expandedIndex === m.index" class="border-t-2 border-slate-200 mt-3 pt-3.5">
          <!-- Team 1 -->
          <div class="text-[0.72rem] font-bold uppercase tracking-[0.8px] text-slate-500 mb-1.5">Team 1</div>
          <div class="grid grid-cols-2 gap-2 mb-3">
            <div
              v-for="p in store.room.players"
              :key="'t1-' + p.name"
              class="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-[0.88rem] font-semibold cursor-pointer transition-all"
              :class="{
                'border-green-600 bg-green-100': editTeam1.includes(p.name),
                'opacity-35 cursor-not-allowed': editTeam2.includes(p.name),
                'border-slate-200 bg-slate-50 hover:border-slate-300': !editTeam1.includes(p.name) && !editTeam2.includes(p.name),
              }"
              @click="toggle('team1', p.name, teamSize(m))"
            >
              <div
                class="w-7 h-7 rounded-full text-white text-[0.75rem] font-bold flex items-center justify-center shrink-0"
                :style="{ background: avatarColor(p.name) }"
              >{{ p.name[0].toUpperCase() }}</div>
              <span class="flex-1">{{ p.name }}</span>
              <span v-if="editTeam1.includes(p.name)" class="text-green-600 font-extrabold">✓</span>
            </div>
          </div>

          <!-- Team 2 -->
          <div class="text-[0.72rem] font-bold uppercase tracking-[0.8px] text-slate-500 mb-1.5">Team 2</div>
          <div class="grid grid-cols-2 gap-2 mb-3">
            <div
              v-for="p in store.room.players"
              :key="'t2-' + p.name"
              class="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-[0.88rem] font-semibold cursor-pointer transition-all"
              :class="{
                'border-green-600 bg-green-100': editTeam2.includes(p.name),
                'opacity-35 cursor-not-allowed': editTeam1.includes(p.name),
                'border-slate-200 bg-slate-50 hover:border-slate-300': !editTeam2.includes(p.name) && !editTeam1.includes(p.name),
              }"
              @click="toggle('team2', p.name, teamSize(m))"
            >
              <div
                class="w-7 h-7 rounded-full text-white text-[0.75rem] font-bold flex items-center justify-center shrink-0"
                :style="{ background: avatarColor(p.name) }"
              >{{ p.name[0].toUpperCase() }}</div>
              <span class="flex-1">{{ p.name }}</span>
              <span v-if="editTeam2.includes(p.name)" class="text-green-600 font-extrabold">✓</span>
            </div>
          </div>

          <p class="text-[0.76rem] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 mb-3">
            Pending matches after this one will regenerate to maintain fairness, keeping other pinned matches.
          </p>

          <div class="flex gap-2.5">
            <button
              class="flex-1 py-2.5 px-4 bg-slate-200 text-slate-800 rounded-lg font-semibold text-[0.85rem] cursor-pointer hover:bg-slate-300 transition-colors"
              @click="cancelEdit"
            >Cancel</button>
            <button
              class="flex-1 py-2.5 px-4 bg-green-600 text-white rounded-lg font-semibold text-[0.85rem] cursor-pointer hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!isValid(m) || saving"
              @click="saveEdit(m)"
            >{{ saving ? 'Saving…' : 'Save & Regenerate' }}</button>
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

const teamSize = () => 2

function toggleExpand(idx) {
  if (expandedIndex.value === idx) { expandedIndex.value = null; return }
  const m = store.editableMatches.find(m => m.index === idx)
  if (!m) return
  editTeam1.value = [...m.team1]
  editTeam2.value = [...m.team2]
  expandedIndex.value = idx
}

function cancelEdit() { expandedIndex.value = null }

function toggle(side, name, size) {
  const t     = side === 'team1' ? editTeam1 : editTeam2
  const other = side === 'team1' ? editTeam2 : editTeam1
  if (other.value.includes(name)) return
  t.value = t.value.includes(name)
    ? t.value.filter(n => n !== name)
    : t.value.length < size ? [...t.value, name] : t.value
}

const isValid = m => {
  const s = teamSize(m)
  return editTeam1.value.length === s && editTeam2.value.length === s &&
    new Set([...editTeam1.value, ...editTeam2.value]).size === s * 2
}

async function saveEdit(m) {
  if (!isValid(m)) return
  saving.value = true
  await store.editMatch(m.index, [...editTeam1.value], [...editTeam2.value])
  saving.value = false
  expandedIndex.value = null
}
</script>
