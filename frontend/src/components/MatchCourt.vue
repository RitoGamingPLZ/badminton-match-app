<template>
  <div>
    <!-- SVG Court + player slot overlays -->
    <div
      ref="courtRef"
      class="relative w-full select-none"
      style="padding-bottom: 90%;"
    >
      <!-- SVG court background -->
      <svg
        viewBox="0 0 200 180"
        xmlns="http://www.w3.org/2000/svg"
        class="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <!-- Green felt background -->
        <rect width="200" height="180" fill="#2d6a4f" rx="4"/>

        <!-- Court outer boundary -->
        <rect x="12" y="8" width="176" height="164" fill="none" stroke="white" stroke-width="1.5"/>

        <!-- Net line (center) -->
        <line x1="12" y1="90" x2="188" y2="90" stroke="white" stroke-width="3"/>

        <!-- Short service lines -->
        <line x1="12" y1="60" x2="188" y2="60" stroke="white" stroke-width="1" opacity="0.75"/>
        <line x1="12" y1="120" x2="188" y2="120" stroke="white" stroke-width="1" opacity="0.75"/>

        <!-- Center service line (between service lines only) -->
        <line x1="100" y1="60" x2="100" y2="120" stroke="white" stroke-width="1" opacity="0.75"/>

        <!-- Team labels -->
        <text x="100" y="37.5" text-anchor="middle" fill="white" font-size="7" opacity="0.6"
              font-family="sans-serif" font-weight="bold" letter-spacing="1.5">TEAM 1</text>
        <text x="100" y="150" text-anchor="middle" fill="white" font-size="7" opacity="0.6"
              font-family="sans-serif" font-weight="bold" letter-spacing="1.5">TEAM 2</text>
      </svg>

      <!-- Player slots: Team 1 (top half) -->
      <div
        v-for="(name, i) in localTeam1"
        :key="'t1-' + i"
        class="absolute flex flex-col items-center"
        :style="slotWrapStyle('team1', i)"
      >
        <div
          :data-slot="`team1-${i}`"
          class="rounded-full flex items-center justify-center text-white font-bold transition-all"
          :class="[
            isDragOver === `team1-${i}` ? 'scale-110 brightness-125' : '',
            editable && name ? 'cursor-grab active:cursor-grabbing' : '',
            editable && !name ? 'cursor-default' : '',
          ]"
          :style="slotCircleStyle(name)"
          :draggable="editable && !!name"
          @dragstart="onDragStart($event, 'team1', i)"
          @dragover.prevent="isDragOver = `team1-${i}`"
          @dragleave="isDragOver = null"
          @drop.prevent="onDrop($event, 'team1', i)"
          @touchstart.passive="onTouchStart($event, 'team1', i)"
        >
          <span :style="avatarInitialStyle">{{ name ? name[0].toUpperCase() : '+' }}</span>
        </div>
        <div :style="nameLabelStyle">{{ displayName(name) }}</div>
      </div>

      <!-- Player slots: Team 2 (bottom half) -->
      <div
        v-for="(name, i) in localTeam2"
        :key="'t2-' + i"
        class="absolute flex flex-col items-center"
        :style="slotWrapStyle('team2', i)"
      >
        <div
          :data-slot="`team2-${i}`"
          class="rounded-full flex items-center justify-center text-white font-bold transition-all"
          :class="[
            isDragOver === `team2-${i}` ? 'scale-110 brightness-125' : '',
            editable && name ? 'cursor-grab active:cursor-grabbing' : '',
            editable && !name ? 'cursor-default' : '',
          ]"
          :style="slotCircleStyle(name)"
          :draggable="editable && !!name"
          @dragstart="onDragStart($event, 'team2', i)"
          @dragover.prevent="isDragOver = `team2-${i}`"
          @dragleave="isDragOver = null"
          @drop.prevent="onDrop($event, 'team2', i)"
          @touchstart.passive="onTouchStart($event, 'team2', i)"
        >
          <span :style="avatarInitialStyle">{{ name ? name[0].toUpperCase() : '+' }}</span>
        </div>
        <div :style="nameLabelStyle">{{ displayName(name) }}</div>
      </div>
    </div>

    <!-- Bench (editable mode only) -->
    <template v-if="editable">
      <div class="text-[0.68rem] font-bold uppercase tracking-[0.8px] text-slate-500 mt-3 mb-1.5">
        Bench — drag to swap players
      </div>
      <!-- Bench drop zone -->
      <div
        data-bench="true"
        class="flex flex-wrap gap-1.5 min-h-[2.5rem] rounded-xl border-2 border-dashed p-1.5 transition-colors"
        :class="isDragOver === 'bench' ? 'border-slate-400 bg-slate-100' : 'border-slate-200 bg-white'"
        @dragover.prevent="isDragOver = 'bench'"
        @dragleave="isDragOver = null"
        @drop.prevent="onDropToBench"
      >
        <div
          v-for="p in benchPlayers"
          :key="p.name"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-[0.82rem] font-semibold text-slate-700 cursor-grab active:cursor-grabbing transition-all hover:border-slate-300"
          draggable="true"
          @dragstart="onDragStart($event, 'bench', null, p.name)"
          @touchstart.passive="onTouchStart($event, 'bench', null, p.name)"
        >
          {{ p.name }}
        </div>
        <span v-if="!benchPlayers.length" class="text-[0.78rem] text-slate-400 italic py-0.5 px-1">
          All players on court
        </span>
      </div>

      <!-- Pending indicator -->
      <div v-if="isDirty && !autoSavePending" class="text-[0.72rem] text-amber-600 font-semibold mt-1.5 text-center">
        Saving teams…
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { avatarColor } from '../utils.js'

const props = defineProps({
  match:    { type: Object,  required: true },
  editable: { type: Boolean, default: false },
  players:  { type: Array,   default: () => [] },
})

const emit = defineEmits(['save'])

// Local editable copies of teams (null = empty slot)
const localTeam1 = ref([...props.match.team1])
const localTeam2 = ref([...props.match.team2])

watch(() => props.match, (m) => {
  if (!isDirty.value) {
    localTeam1.value = [...m.team1]
    localTeam2.value = [...m.team2]
  }
}, { deep: true })

const isDirty = computed(() =>
  JSON.stringify(localTeam1.value) !== JSON.stringify(props.match.team1) ||
  JSON.stringify(localTeam2.value) !== JSON.stringify(props.match.team2)
)

const isValid = computed(() =>
  localTeam1.value.every(n => n) &&
  localTeam2.value.every(n => n) &&
  new Set([...localTeam1.value, ...localTeam2.value]).size === 4
)

const benchPlayers = computed(() => {
  const onCourt = new Set([...localTeam1.value, ...localTeam2.value].filter(Boolean))
  return props.players.filter(p => !onCourt.has(p.name))
})

// ── Auto-save (debounced 2s after last drop) ─────────────────────────────────
let autoSaveTimer = null
const autoSavePending = ref(true)

function scheduleAutoSave() {
  autoSavePending.value = true
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSavePending.value = false
    if (isValid.value) emit('save', [...localTeam1.value], [...localTeam2.value])
  }, 2000)
}

onUnmounted(() => { if (autoSaveTimer) clearTimeout(autoSaveTimer) })

// ── Sizing helpers (consistent with 90% aspect ratio court) ─────────────────
const slotPositions = {
  team1: [{ top: '30%', left: '27%' }, { top: '30%', left: '73%' }],
  team2: [{ top: '75%', left: '27%' }, { top: '75%', left: '73%' }],
}

function slotWrapStyle(team, index) {
  const { top, left } = slotPositions[team][index]
  return { position: 'absolute', top, left, transform: 'translate(-50%, -50%)', width: '18%', alignItems: 'center' }
}

function slotCircleStyle(name) {
  return {
    width: '100%',
    aspectRatio: '1',
    background: name ? avatarColor(name) : 'rgba(255,255,255,0.15)',
    border: name ? 'none' : '2px dashed rgba(255,255,255,0.5)',
    boxShadow: name ? '0 2px 8px rgba(0,0,0,0.25)' : 'none',
  }
}

const avatarInitialStyle = { fontSize: 'clamp(14px, 5vw, 22px)', fontWeight: '800', lineHeight: '1' }
const nameLabelStyle = {
  marginTop: '4px',
  fontSize: 'clamp(12px, 3.6vw, 18px)',
  fontWeight: '700',
  color: 'white',
  textShadow: '0 1px 4px rgba(0,0,0,0.7)',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
  textAlign: 'center',
}

function displayName(name) {
  if (!name) return 'Empty'
  return name.length > 6 ? name.slice(0, 5) + '…' : name
}

// ── Mouse drag state ─────────────────────────────────────────────────────────
const isDragOver = ref(null)
let dragPayload = null

function onDragStart(event, team, index, nameOverride) {
  const name = nameOverride ?? (team === 'team1' ? localTeam1.value[index] : localTeam2.value[index])
  dragPayload = { team, index, name }
  event.dataTransfer.effectAllowed = 'move'
}

function onDrop(event, targetTeam, targetIndex) {
  isDragOver.value = null
  if (!dragPayload) return
  performDrop(dragPayload, targetTeam, targetIndex)
  dragPayload = null
  scheduleAutoSave()
}

function onDropToBench(event) {
  isDragOver.value = null
  if (!dragPayload || dragPayload.team === 'bench') return
  clearSlot(dragPayload.team, dragPayload.index)
  dragPayload = null
  // Don't auto-save — slot is empty, user must fill it first
}

function performDrop(src, targetTeam, targetIndex) {
  const targetList = targetTeam === 'team1' ? localTeam1 : localTeam2

  if (src.team === 'bench') {
    // Bench → slot: place bench player, evict current occupant (goes to bench automatically via computed)
    targetList.value = targetList.value.map((n, i) => i === targetIndex ? src.name : n)
  } else {
    const srcList = src.team === 'team1' ? localTeam1 : localTeam2
    if (src.team === targetTeam) {
      // Same team swap
      const arr = [...srcList.value]
      ;[arr[src.index], arr[targetIndex]] = [arr[targetIndex], arr[src.index]]
      srcList.value = arr
    } else {
      // Cross-team swap
      const s = [...srcList.value]
      const t = [...targetList.value]
      ;[s[src.index], t[targetIndex]] = [t[targetIndex], s[src.index]]
      srcList.value = s
      targetList.value = t
    }
  }
}

function clearSlot(team, index) {
  const list = team === 'team1' ? localTeam1 : localTeam2
  list.value = list.value.map((n, i) => i === index ? null : n)
}

// ── Touch drag ───────────────────────────────────────────────────────────────
const courtRef = ref(null)
let touchPayload = null
let ghostEl = null

function onTouchStart(event, team, index, nameOverride) {
  if (!props.editable) return
  const name = nameOverride ?? (team === 'team1' ? localTeam1.value[index] : localTeam2.value[index])
  if (!name && team !== 'bench') return

  touchPayload = { team, index, name }
  const touch = event.touches[0]

  ghostEl = document.createElement('div')
  const size = Math.round(Math.min(window.innerWidth, 480) * 0.14)
  Object.assign(ghostEl.style, {
    position: 'fixed',
    width: size + 'px',
    height: size + 'px',
    borderRadius: '50%',
    background: name ? avatarColor(name) : 'rgba(100,100,100,0.7)',
    color: 'white',
    fontWeight: '800',
    fontSize: Math.round(size * 0.42) + 'px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: '9999',
    opacity: '0.85',
    transform: 'translate(-50%, -50%)',
    left: touch.clientX + 'px',
    top: touch.clientY + 'px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
  })
  ghostEl.textContent = name ? name[0].toUpperCase() : '+'
  document.body.appendChild(ghostEl)
}

function onTouchMove(event) {
  if (!touchPayload || !ghostEl) return
  event.preventDefault()
  const touch = event.touches[0]
  ghostEl.style.left = touch.clientX + 'px'
  ghostEl.style.top  = touch.clientY + 'px'
}

function onTouchEnd(event) {
  if (!touchPayload) return

  if (ghostEl) { ghostEl.remove(); ghostEl = null }

  const touch = event.changedTouches[0]
  const el = document.elementFromPoint(touch.clientX, touch.clientY)

  const slotEl  = el?.closest('[data-slot]')
  const benchEl = el?.closest('[data-bench]')

  if (slotEl) {
    const [targetTeam, idxStr] = slotEl.dataset.slot.split('-')
    performDrop(touchPayload, targetTeam, parseInt(idxStr))
    scheduleAutoSave()
  } else if (benchEl && touchPayload.team !== 'bench') {
    clearSlot(touchPayload.team, touchPayload.index)
  }

  isDragOver.value = null
  touchPayload = null
}

onMounted(() => {
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('touchend', onTouchEnd)
})

onUnmounted(() => {
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('touchend', onTouchEnd)
  if (ghostEl) { ghostEl.remove(); ghostEl = null }
})
</script>
