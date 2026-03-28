<template>
  <div class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-sheet">
      <div class="modal-title">✏️ Edit Current Match</div>

      <p class="hint-text" style="margin-bottom:16px;">
        Select {{ teamSize }} player{{ teamSize > 1 ? 's' : '' }} for each team.
        The upcoming schedule will regenerate to keep play counts fair.
      </p>

      <!-- Team 1 -->
      <div class="section-lbl">Team 1</div>
      <div class="player-grid">
        <div
          v-for="p in players"
          :key="'t1-' + p.name"
          class="pick-btn"
          :class="{
            selected: team1.includes(p.name),
            disabled: team2.includes(p.name),
          }"
          @click="toggle('team1', p.name)"
        >
          <div class="avatar sm" :style="{ background: avatarColor(p.name) }">
            {{ p.name[0].toUpperCase() }}
          </div>
          <span>{{ p.name }}</span>
          <span class="check" v-if="team1.includes(p.name)">✓</span>
        </div>
      </div>

      <!-- Team 2 -->
      <div class="section-lbl" style="margin-top:14px;">Team 2</div>
      <div class="player-grid">
        <div
          v-for="p in players"
          :key="'t2-' + p.name"
          class="pick-btn"
          :class="{
            selected: team2.includes(p.name),
            disabled: team1.includes(p.name),
          }"
          @click="toggle('team2', p.name)"
        >
          <div class="avatar sm" :style="{ background: avatarColor(p.name) }">
            {{ p.name[0].toUpperCase() }}
          </div>
          <span>{{ p.name }}</span>
          <span class="check" v-if="team2.includes(p.name)">✓</span>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" @click="$emit('cancel')">Cancel</button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="!isValid"
          @click="confirm"
        >
          Confirm & Regenerate
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { avatarColor } from '../utils.js'

const props = defineProps({
  match:   { type: Object,  required: true },
  players: { type: Array,   required: true },
})
const emit = defineEmits(['confirm', 'cancel'])

const teamSize = computed(() => props.match.format === 'singles' ? 1 : 2)

// Pre-populate from current match
const team1 = ref([...props.match.team1])
const team2 = ref([...props.match.team2])

function toggle(side, name) {
  const t = side === 'team1' ? team1 : team2
  const other = side === 'team1' ? team2 : team1
  if (other.value.includes(name)) return  // already on opposite team

  if (t.value.includes(name)) {
    t.value = t.value.filter(n => n !== name)
  } else if (t.value.length < teamSize.value) {
    t.value = [...t.value, name]
  }
}

const isValid = computed(() =>
  team1.value.length === teamSize.value &&
  team2.value.length === teamSize.value &&
  new Set([...team1.value, ...team2.value]).size === teamSize.value * 2
)

function confirm() {
  if (!isValid.value) return
  emit('confirm', { team1: team1.value, team2: team2.value })
}
</script>

<style scoped>
.player-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pick-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 2px solid var(--border);
  background: var(--bg);
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
  transition: all 0.15s;
  position: relative;
}
.pick-btn.selected { border-color: var(--green); background: var(--green-light); }
.pick-btn.disabled { opacity: 0.35; cursor: not-allowed; }
.avatar.sm { width: 28px; height: 28px; font-size: 0.75rem; }
.check { margin-left: auto; color: var(--green); font-weight: 800; }
.modal-actions { display: flex; gap: 10px; margin-top: 20px; }
.modal-actions .btn { flex: 1; }
.hint-text { font-size: 0.82rem; color: var(--muted); }
</style>
