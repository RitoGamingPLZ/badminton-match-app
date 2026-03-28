<template>
  <div class="card">
    <div class="card-title">🔑 Join Room</div>

    <div class="field">
      <label>Room Code</label>
      <input
        v-model="code"
        class="code"
        placeholder="1234"
        maxlength="4"
        inputmode="numeric"
        pattern="[0-9]*"
        @input="code = code.replace(/\D/g, '')"
        @keydown.enter="submit"
      />
    </div>

    <div class="field">
      <label>Your Name</label>
      <input
        v-model="name"
        placeholder="e.g. Sarah"
        maxlength="20"
        @keydown.enter="submit"
      />
    </div>

    <button
      class="btn btn-primary"
      :disabled="store.loading || code.length !== 4 || !name.trim()"
      @click="submit"
    >
      {{ store.loading ? 'Joining…' : 'Join Room' }}
    </button>
    <button class="btn btn-secondary" @click="store.view = 'home'">← Back</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoomStore } from '../store/room.js'

const store = useRoomStore()
const code = ref('')
const name = ref('')

function submit() {
  if (code.value.length !== 4 || !name.value.trim()) return
  store.joinRoom(code.value, name.value.trim())
}
</script>
