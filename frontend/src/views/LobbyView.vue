<template>
  <div>
    <!-- Room code -->
    <div class="code-box">
      <div class="lbl">Room Code</div>
      <div class="code">{{ store.room?.code }}</div>
      <div class="hint">Share this code with friends to join</div>
    </div>

    <!-- Players -->
    <div class="card">
      <div class="card-title">
        Players
        <span style="color:var(--muted);font-weight:500;font-size:0.85rem;">
          ({{ store.room?.players.length }})
        </span>
      </div>

      <ul class="player-list">
        <li v-for="(p, i) in store.room?.players" :key="p.name" class="player-item">
          <div class="player-left">
            <div class="avatar" :style="{ background: avatarColor(p.name) }">
              {{ p.name[0].toUpperCase() }}
            </div>
            <span style="font-weight:600">{{ p.name }}</span>
          </div>
          <span v-if="i === 0" class="badge badge-host">Host</span>
        </li>
      </ul>

      <!-- Host controls -->
      <template v-if="store.isHost">
        <div style="margin-top:16px;">
          <div class="section-lbl">Match Format</div>
          <FormatPicker :model-value="store.room?.format" @update:model-value="store.setFormat($event)" />
        </div>

        <button
          class="btn btn-amber"
          style="margin-top:10px"
          :disabled="store.loading || !canStart"
          @click="store.startSession()"
        >
          {{ store.loading ? 'Generating…' : 'Generate Matches' }}
        </button>
        <p v-if="!canStart" class="hint-text">
          Need at least {{ minPlayers }} players for {{ store.room?.format }}
        </p>
      </template>

      <!-- Non-host waiting -->
      <template v-else>
        <div class="waiting">
          <div class="dots">
            <span>🏸</span><span>🏸</span><span>🏸</span>
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
import FormatPicker from '../components/FormatPicker.vue'
import { avatarColor } from '../utils.js'

const store = useRoomStore()

const minPlayers = computed(() => store.room?.format === 'singles' ? 2 : 4)
const canStart   = computed(() => (store.room?.players.length ?? 0) >= minPlayers.value)
</script>

<style scoped>
.waiting { text-align: center; padding: 20px 0; color: var(--muted); font-size: 0.88rem; }
.waiting p { margin-top: 12px; }
.hint-text { font-size: 0.78rem; color: var(--muted); margin-top: 8px; text-align: center; }
</style>
