<template>
  <div>
    <!-- SVG Court + player slot overlays -->
    <div class="relative w-full select-none" style="padding-bottom: 62%;">
      <!-- SVG court background -->
      <svg
        viewBox="0 0 200 124"
        xmlns="http://www.w3.org/2000/svg"
        class="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <!-- Green felt background -->
        <rect width="200" height="124" fill="#2d6a4f" rx="4"/>

        <!-- Court outer boundary -->
        <rect x="14" y="8" width="172" height="108" fill="none" stroke="white" stroke-width="1.5"/>

        <!-- Net line (center) -->
        <line x1="14" y1="62" x2="186" y2="62" stroke="white" stroke-width="2.5"/>
        <!-- Net posts -->
        <line x1="14" y1="58" x2="14" y2="66" stroke="white" stroke-width="2"/>
        <line x1="186" y1="58" x2="186" y2="66" stroke="white" stroke-width="2"/>

        <!-- Short service lines -->
        <line x1="14" y1="42" x2="186" y2="42" stroke="white" stroke-width="1" opacity="0.7"/>
        <line x1="14" y1="82" x2="186" y2="82" stroke="white" stroke-width="1" opacity="0.7"/>

        <!-- Center service line (between service lines only) -->
        <line x1="100" y1="42" x2="100" y2="82" stroke="white" stroke-width="1" opacity="0.7"/>

        <!-- Back service lines (doubles) -->
        <line x1="14" y1="14" x2="186" y2="14" stroke="white" stroke-width="1" opacity="0.5"/>
        <line x1="14" y1="110" x2="186" y2="110" stroke="white" stroke-width="1" opacity="0.5"/>

        <!-- Team labels -->
        <text x="100" y="24" text-anchor="middle" fill="white" font-size="5" opacity="0.6" font-family="sans-serif" font-weight="bold" letter-spacing="1">TEAM 1</text>
        <text x="100" y="118" text-anchor="middle" fill="white" font-size="5" opacity="0.6" font-family="sans-serif" font-weight="bold" letter-spacing="1">TEAM 2</text>
      </svg>

      <!-- Player slots: Team 1 (top half) -->
      <div
        v-for="(name, i) in localTeam1"
        :key="'t1-' + i"
        class="absolute flex flex-col items-center gap-0.5"
        :style="slotStyle('team1', i)"
      >
        <!-- Slot circle (drop target) -->
        <div
          class="rounded-full flex items-center justify-center text-white font-bold transition-all cursor-grab active:cursor-grabbing"
          :class="[
            isDragOver === `team1-${i}` ? 'ring-2 ring-white ring-offset-1 scale-110' : '',
            editable ? 'cursor-grab' : ''
          ]"
          :style="{ width: slotSize, height: slotSize, background: name ? avatarColor(name) : 'rgba(255,255,255,0.2)', fontSize: avatarFontSize, border: name ? 'none' : '2px dashed rgba(255,255,255,0.5)' }"
          :draggable="editable && !!name"
          @dragstart="onDragStart($event, 'team1', i)"
          @dragover.prevent="isDragOver = `team1-${i}`"
          @dragleave="isDragOver = null"
          @drop.prevent="onDrop($event, 'team1', i)"
        >
          {{ name ? name[0].toUpperCase() : '+' }}
        </div>
        <!-- Player name label -->
        <div
          class="text-white font-semibold truncate text-center"
          :style="{ fontSize: nameFontSize, maxWidth: slotSize, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }"
        >{{ name || 'Empty' }}</div>
      </div>

      <!-- Player slots: Team 2 (bottom half) -->
      <div
        v-for="(name, i) in localTeam2"
        :key="'t2-' + i"
        class="absolute flex flex-col items-center gap-0.5"
        :style="slotStyle('team2', i)"
      >
        <div
          class="rounded-full flex items-center justify-center text-white font-bold transition-all"
          :class="[
            isDragOver === `team2-${i}` ? 'ring-2 ring-white ring-offset-1 scale-110' : '',
            editable ? 'cursor-grab' : ''
          ]"
          :style="{ width: slotSize, height: slotSize, background: name ? avatarColor(name) : 'rgba(255,255,255,0.2)', fontSize: avatarFontSize, border: name ? 'none' : '2px dashed rgba(255,255,255,0.5)' }"
          :draggable="editable && !!name"
          @dragstart="onDragStart($event, 'team2', i)"
          @dragover.prevent="isDragOver = `team2-${i}`"
          @dragleave="isDragOver = null"
          @drop.prevent="onDrop($event, 'team2', i)"
        >
          {{ name ? name[0].toUpperCase() : '+' }}
        </div>
        <div
          class="text-white font-semibold truncate text-center"
          :style="{ fontSize: nameFontSize, maxWidth: slotSize, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }"
        >{{ name || 'Empty' }}</div>
      </div>
    </div>

    <!-- Bench (editable mode only) -->
    <template v-if="editable">
      <div class="text-[0.68rem] font-bold uppercase tracking-[0.8px] text-slate-500 mt-3 mb-1.5">
        Bench — drag onto court to swap
      </div>
      <div class="flex flex-wrap gap-1.5 mb-3">
        <div
          v-for="p in benchPlayers"
          :key="p.name"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border-2 border-slate-200 bg-white text-[0.8rem] font-semibold text-slate-700 cursor-grab active:cursor-grabbing select-none transition-all hover:border-slate-300"
          draggable="true"
          @dragstart="onDragStart($event, 'bench', null, p.name)"
        >
          <div
            class="w-5 h-5 rounded-full text-white text-[0.65rem] font-bold flex items-center justify-center shrink-0"
            :style="{ background: avatarColor(p.name) }"
          >{{ p.name[0].toUpperCase() }}</div>
          {{ p.name }}
        </div>
        <div v-if="!benchPlayers.length" class="text-[0.78rem] text-slate-400 italic py-1">
          All players are on court
        </div>
      </div>

      <!-- Save / Cancel bar -->
      <div v-if="isDirty" class="flex gap-2">
        <button
          class="flex-1 py-2 px-4 bg-slate-200 text-slate-700 rounded-lg font-semibold text-[0.82rem] cursor-pointer hover:bg-slate-300 transition-colors"
          @click="cancelEdit"
        >Cancel</button>
        <button
          class="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg font-semibold text-[0.82rem] cursor-pointer hover:bg-green-700 transition-colors"
          @click="saveEdit"
        >Save Teams</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { avatarColor } from '../utils.js'

const props = defineProps({
  match:    { type: Object,  required: true },
  editable: { type: Boolean, default: false },
  players:  { type: Array,   default: () => [] },
})

const emit = defineEmits(['save'])

// Local editable copies of the teams
const localTeam1 = ref([...props.match.team1])
const localTeam2 = ref([...props.match.team2])

// Re-sync when the match prop changes externally
watch(() => props.match, (m) => {
  localTeam1.value = [...m.team1]
  localTeam2.value = [...m.team2]
}, { deep: true })

const isDirty = computed(() =>
  JSON.stringify(localTeam1.value) !== JSON.stringify(props.match.team1) ||
  JSON.stringify(localTeam2.value) !== JSON.stringify(props.match.team2)
)

// Players not currently on the court
const benchPlayers = computed(() => {
  const onCourt = new Set([...localTeam1.value, ...localTeam2.value])
  return props.players.filter(p => !onCourt.has(p.name))
})

// ── Drag state ──────────────────────────────────────────────────────────────
const isDragOver = ref(null)

// drag payload: { team: 'team1'|'team2'|'bench', index: number|null, name: string }
let dragPayload = null

function onDragStart(event, team, index, nameOverride) {
  const name = nameOverride ?? (team === 'team1' ? localTeam1.value[index] : localTeam2.value[index])
  dragPayload = { team, index, name }
  event.dataTransfer.effectAllowed = 'move'
}

function onDrop(event, targetTeam, targetIndex) {
  isDragOver.value = null
  if (!dragPayload) return

  const { team: srcTeam, index: srcIndex, name: srcName } = dragPayload
  dragPayload = null

  const targetList = targetTeam === 'team1' ? localTeam1 : localTeam2
  const currentOccupant = targetList.value[targetIndex]

  if (srcTeam === 'bench') {
    // Swap bench player with current occupant (put current occupant back to bench)
    targetList.value = targetList.value.map((n, i) => i === targetIndex ? srcName : n)
    // If the evicted player was also in team1/team2, remove them — handled naturally
    // since bench is computed from what's NOT on court
  } else {
    // Swap two court slots
    const srcList = srcTeam === 'team1' ? localTeam1 : localTeam2
    if (srcTeam === targetTeam) {
      // Same team — swap within
      const arr = [...srcList.value]
      ;[arr[srcIndex], arr[targetIndex]] = [arr[targetIndex], arr[srcIndex]]
      srcList.value = arr
    } else {
      // Cross-team swap
      const s = [...srcList.value]
      const t = [...targetList.value]
      ;[s[srcIndex], t[targetIndex]] = [t[targetIndex], s[srcIndex]]
      srcList.value = s
      targetList.value = t
    }
  }
}

function saveEdit() {
  emit('save', [...localTeam1.value], [...localTeam2.value])
}

function cancelEdit() {
  localTeam1.value = [...props.match.team1]
  localTeam2.value = [...props.match.team2]
}

// ── Responsive sizing helpers ────────────────────────────────────────────────
// The court container has padding-bottom: 62% making it 62% of its width tall.
// Slot positions as percentages: top/left applied to the absolute divs.
// Slots are centered via transform translate(-50%, -50%).
const slotSize      = '13%'   // of parent width via width/height CSS string
const avatarFontSize = '1.3vw'
const nameFontSize   = '1.2vw'

function slotStyle(team, index) {
  // top/left expressed as % of the container (which has padding-bottom: 62%)
  const positions = {
    team1: [
      { top: '28%', left: '30%' },
      { top: '28%', left: '70%' },
    ],
    team2: [
      { top: '72%', left: '30%' },
      { top: '72%', left: '70%' },
    ],
  }
  const pos = positions[team][index]
  return {
    top: pos.top,
    left: pos.left,
    transform: 'translate(-50%, -50%)',
    width: '13%',
  }
}
</script>
