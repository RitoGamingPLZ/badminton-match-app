<template>
  <div>
    <div class="hero">
      <div class="hero-icon">🏸</div>
      <h2>Welcome!</h2>
      <p>Create or join a session with your friends</p>
    </div>

    <button class="btn btn-primary" @click="store.view = 'create'">
      ✨ Create New Room
    </button>
    <button class="btn btn-outline" @click="store.view = 'join'">
      🔑 Join a Room
    </button>
  </div>
</template>

<script setup>
import { useRoomStore } from '../store/room.js'
const store = useRoomStore()
</script>

<style scoped>
.hero {
  text-align: center;
  padding: 36px 0 28px;
}
.hero-icon { font-size: 4rem; margin-bottom: 12px; }
.hero h2 { font-size: 1.5rem; font-weight: 800; margin-bottom: 8px; }
.hero p { color: var(--muted); font-size: 0.9rem; }
</style>
