<template>
  <div class="min-h-screen bg-slate-50 pb-10 font-sans">

    <!-- Header -->
    <header class="bg-green-600 text-white px-4 sticky top-0 z-50 shadow-[0_2px_12px_rgba(22,163,74,0.3)]">
      <div class="max-w-[480px] mx-auto flex items-center justify-between h-14">
        <h1 class="text-[1.2rem] font-bold">🏸 Badminton Match</h1>
        <button
          v-if="store.room"
          class="bg-white/20 border-none text-white px-3.5 py-1.5 rounded-full text-[0.82rem] font-semibold cursor-pointer hover:bg-white/35"
          @click="store.leaveRoom()"
        >
          Leave
        </button>
      </div>
    </header>

    <!-- Error toast -->
    <Transition name="toast">
      <div
        v-if="store.error"
        class="fixed bottom-7 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-full text-[0.88rem] font-semibold z-[9999] cursor-pointer whitespace-nowrap max-w-[90vw] text-center"
        @click="store.clearError()"
      >
        {{ store.error }}
      </div>
    </Transition>

    <!-- Views -->
    <main class="max-w-[480px] mx-auto px-4 pt-5">
      <HomeView        v-if="store.view === 'home'"        />
      <LobbyView       v-if="store.view === 'lobby'"       />
      <SessionView     v-if="store.view === 'session'"     />
      <EditMatchesView v-if="store.view === 'editMatches'" />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoomStore } from './store/room.js'
import HomeView        from './views/HomeView.vue'
import LobbyView       from './views/LobbyView.vue'
import SessionView     from './views/SessionView.vue'
import EditMatchesView from './views/EditMatchesView.vue'

const store = useRoomStore()
onMounted(() => store.tryRestoreSession())
</script>
