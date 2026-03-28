<template>
  <div class="card">
    <div class="card-title">✨ Create Room</div>

    <div class="field">
      <label>Your Name</label>
      <input
        v-model="name"
        placeholder="e.g. Alan"
        maxlength="20"
        @keydown.enter="submit"
      />
    </div>

    <div class="field">
      <label>Match Format</label>
    </div>
    <FormatPicker v-model="format" />

    <button
      class="btn btn-primary"
      :disabled="store.loading || !name.trim()"
      @click="submit"
      style="margin-top: 6px"
    >
      {{ store.loading ? 'Creating…' : 'Create Room' }}
    </button>
    <button class="btn btn-secondary" @click="store.view = 'home'">← Back</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoomStore } from '../store/room.js'
import FormatPicker from '../components/FormatPicker.vue'

const store = useRoomStore()
const name = ref('')
const format = ref('doubles')

function submit() {
  if (!name.value.trim()) return
  store.createRoom(name.value.trim(), format.value)
}
</script>
