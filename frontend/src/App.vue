<template>
  <div class="min-h-screen bg-slate-50 pb-10 font-sans">

    <!-- Floating leave button (shown when in a room) -->
    <div v-if="store.room" class="fixed top-3 right-3 z-50">
      <button
        class="bg-white border border-slate-200 text-slate-500 px-3 py-1.5 rounded-full text-[0.8rem] font-semibold cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
        @click="store.leaveRoom()"
      >
        Leave
      </button>
    </div>

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
    <main class="max-w-[480px] mx-auto px-4 pt-8">
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
