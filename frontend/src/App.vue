<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-inner">
        <h1>🏸 Badminton Match</h1>
        <button v-if="store.room" class="leave-btn" @click="store.leaveRoom()">Leave</button>
      </div>
    </header>

    <!-- Global error toast -->
    <Transition name="toast">
      <div v-if="store.error" class="toast error" @click="store.clearError()">
        {{ store.error }}
      </div>
    </Transition>

    <!-- Views -->
    <main class="main">
      <HomeView      v-if="store.view === 'home'"    />
      <CreateView    v-if="store.view === 'create'"  />
      <JoinView      v-if="store.view === 'join'"    />
      <LobbyView     v-if="store.view === 'lobby'"   />
      <SessionView   v-if="store.view === 'session'" />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoomStore } from './store/room.js'
import HomeView    from './views/HomeView.vue'
import CreateView  from './views/CreateView.vue'
import JoinView    from './views/JoinView.vue'
import LobbyView   from './views/LobbyView.vue'
import SessionView from './views/SessionView.vue'

const store = useRoomStore()

onMounted(() => {
  store.tryRestoreSession()
})
</script>

<style>
/* ── Design tokens ──────────────────────────────────────────────────────────── */
:root {
  --green:        #16a34a;
  --green-dark:   #15803d;
  --green-light:  #dcfce7;
  --amber:        #f59e0b;
  --amber-light:  #fef3c7;
  --blue:         #3b82f6;
  --blue-light:   #dbeafe;
  --red:          #ef4444;
  --red-light:    #fee2e2;
  --bg:           #f8fafc;
  --card:         #ffffff;
  --text:         #1e293b;
  --muted:        #64748b;
  --border:       #e2e8f0;
  --radius:       16px;
  --shadow:       0 4px 24px rgba(0,0,0,0.08);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  padding-bottom: 40px;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */
.header {
  background: var(--green);
  color: white;
  padding: 0 16px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 12px rgba(22,163,74,0.3);
}
.header-inner {
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
}
.header h1 { font-size: 1.2rem; font-weight: 700; }
.leave-btn {
  background: rgba(255,255,255,0.2);
  border: none;
  color: white;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}
.leave-btn:hover { background: rgba(255,255,255,0.35); }

/* ── Main container ──────────────────────────────────────────────────────────── */
.main {
  max-width: 480px;
  margin: 0 auto;
  padding: 20px 16px;
}

/* ── Toast ───────────────────────────────────────────────────────────────────── */
.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 30px;
  font-size: 0.88rem;
  font-weight: 600;
  z-index: 9999;
  cursor: pointer;
  white-space: nowrap;
  max-width: 90vw;
  text-align: center;
}
.toast.error { background: var(--red); color: white; }
.toast-enter-active, .toast-leave-active { transition: all 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

/* ── Shared card ─────────────────────────────────────────────────────────────── */
.card {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 22px 18px;
  margin-bottom: 14px;
}
.card-title {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Shared buttons ──────────────────────────────────────────────────────────── */
.btn {
  display: block;
  width: 100%;
  padding: 14px 20px;
  border-radius: 12px;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.btn:active { transform: scale(0.97); }
.btn + .btn { margin-top: 10px; }
.btn-primary  { background: var(--green); color: white; }
.btn-primary:hover { background: var(--green-dark); }
.btn-secondary { background: var(--border); color: var(--text); }
.btn-secondary:hover { background: #cbd5e1; }
.btn-amber { background: var(--amber); color: white; }
.btn-amber:hover { background: #d97706; }
.btn-outline {
  background: transparent;
  color: var(--green);
  border: 2px solid var(--green);
}
.btn-outline:hover { background: var(--green-light); }
.btn-sm {
  padding: 9px 16px;
  font-size: 0.85rem;
  border-radius: 8px;
  width: auto;
  display: inline-block;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

/* ── Shared inputs ───────────────────────────────────────────────────────────── */
.field { margin-bottom: 14px; }
.field label {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}
.field input, .field select {
  width: 100%;
  padding: 13px 14px;
  border: 2px solid var(--border);
  border-radius: 10px;
  font-size: 1rem;
  color: var(--text);
  background: white;
  outline: none;
  transition: border-color 0.15s;
}
.field input:focus, .field select:focus { border-color: var(--green); }
.field input.code { font-size: 2rem; font-weight: 800; letter-spacing: 0.3em; text-align: center; }

/* ── Format picker ───────────────────────────────────────────────────────────── */
.fmt-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.fmt-opt {
  padding: 12px 6px;
  border-radius: 10px;
  border: 2px solid var(--border);
  background: white;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
  user-select: none;
}
.fmt-opt .icon { font-size: 1.4rem; display: block; margin-bottom: 4px; }
.fmt-opt .label { font-size: 0.78rem; font-weight: 600; color: var(--muted); }
.fmt-opt.selected { border-color: var(--green); background: var(--green-light); }
.fmt-opt.selected .label { color: var(--green-dark); }

/* ── Players list ─────────────────────────────────────────────────────────────── */
.player-list { list-style: none; }
.player-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px;
  border-radius: 10px;
  margin-bottom: 6px;
  background: var(--bg);
}
.player-left { display: flex; align-items: center; gap: 10px; }
.avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  color: white;
  font-size: 0.85rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
}
.badge-host { background: var(--green-light); color: var(--green-dark); }
.badge-games { background: var(--border); color: var(--muted); }

/* ── Room code box ─────────────────────────────────────────────────────────────── */
.code-box {
  background: var(--green-light);
  border: 2px solid var(--green);
  border-radius: 14px;
  padding: 18px;
  text-align: center;
  margin-bottom: 14px;
}
.code-box .lbl { font-size: 0.72rem; font-weight: 700; color: var(--green-dark); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
.code-box .code { font-size: 2.8rem; font-weight: 900; color: var(--green-dark); letter-spacing: 0.2em; line-height: 1; }
.code-box .hint { font-size: 0.78rem; color: var(--green-dark); opacity: 0.7; margin-top: 6px; }

/* ── Match card ────────────────────────────────────────────────────────────────── */
.match-card {
  border-radius: 12px;
  border: 2px solid var(--border);
  padding: 14px;
  margin-bottom: 10px;
  background: var(--bg);
  transition: all 0.2s;
}
.match-card.active  { background: var(--amber-light); border-color: var(--amber); }
.match-card.done    { background: var(--green-light); border-color: #86efac; opacity: 0.7; }
.match-card.pending { background: var(--bg); }

.match-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.match-num { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
.status-badge { font-size: 0.7rem; font-weight: 600; padding: 3px 10px; border-radius: 20px; }
.status-badge.active  { background: var(--amber); color: white; }
.status-badge.done    { background: var(--green); color: white; }
.status-badge.pending { background: var(--border); color: var(--muted); }
.fmt-badge { font-size: 0.7rem; font-weight: 600; padding: 3px 9px; border-radius: 20px; background: var(--blue-light); color: var(--blue); margin-right: 4px; }

.court { display: flex; align-items: center; gap: 10px; }
.team {
  flex: 1;
  background: white;
  border-radius: 8px;
  padding: 10px;
  border: 2px solid transparent;
}
.team.winner { border-color: var(--green); }
.team .team-lbl { font-size: 0.68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; }
.team .team-player { font-size: 0.88rem; font-weight: 600; }
.vs { font-size: 0.85rem; font-weight: 800; color: var(--muted); flex-shrink: 0; }

/* ── Tabs ─────────────────────────────────────────────────────────────────────── */
.tabs { display: flex; gap: 4px; background: var(--bg); border-radius: 10px; padding: 4px; margin-bottom: 14px; }
.tab {
  flex: 1; padding: 9px 4px;
  border-radius: 7px; border: none;
  background: transparent; font-size: 0.8rem; font-weight: 600;
  cursor: pointer; color: var(--muted); transition: all 0.15s;
}
.tab.active { background: white; color: var(--green); box-shadow: 0 1px 4px rgba(0,0,0,0.1); }

/* ── Stat row ──────────────────────────────────────────────────────────────────── */
.stat-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 14px; }
.stat { background: var(--bg); border-radius: 10px; padding: 12px 8px; text-align: center; }
.stat-val { font-size: 1.4rem; font-weight: 800; color: var(--green); }
.stat-lbl { font-size: 0.68rem; color: var(--muted); font-weight: 500; margin-top: 2px; }

/* ── Progress bar ─────────────────────────────────────────────────────────────── */
.progress-track { background: var(--border); border-radius: 4px; height: 6px; overflow: hidden; }
.progress-fill  { background: var(--green); height: 100%; transition: width 0.4s; }

/* ── Scrollable list ─────────────────────────────────────────────────────────── */
.scroll-list { max-height: 52vh; overflow-y: auto; padding-right: 2px; }
.scroll-list::-webkit-scrollbar { width: 4px; }
.scroll-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

/* ── Empty state ─────────────────────────────────────────────────────────────── */
.empty { text-align: center; padding: 32px 0; color: var(--muted); font-size: 0.88rem; }
.empty-icon { font-size: 2.5rem; display: block; margin-bottom: 8px; }

/* ── Section label ─────────────────────────────────────────────────────────────── */
.section-lbl {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.8px; color: var(--muted); margin: 10px 0 6px;
}

/* ── Waiting dots ─────────────────────────────────────────────────────────────── */
.dots span { display: inline-block; animation: bounce 1.2s infinite; font-size: 1.3rem; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%,60%,100% { transform: translateY(0); }
  30%          { transform: translateY(-6px); }
}

/* ── Modal ──────────────────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 500;
  display: flex; align-items: flex-end; justify-content: center;
  padding: 0;
}
.modal-sheet {
  background: white;
  border-radius: 24px 24px 0 0;
  width: 100%; max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px 18px 32px;
}
.modal-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; }
.modal-enter-active, .modal-leave-active { transition: all 0.25s; }
.modal-enter-from .modal-sheet, .modal-leave-to .modal-sheet { transform: translateY(100%); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
