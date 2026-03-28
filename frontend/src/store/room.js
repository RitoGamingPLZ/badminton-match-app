/**
 * Pinia store — single source of truth for room state.
 *
 * Responsibilities:
 *  - Persist identity (myName, hostToken, roomCode) to localStorage
 *  - Manage the SSE connection lifecycle
 *  - Re-fetch room state when the browser tab regains focus (Page Visibility API)
 *  - Apply version-based conflict detection
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, openSSE } from '../api.js'

export const useRoomStore = defineStore('room', () => {
  // ── Persistent identity ────────────────────────────────────────────────────
  const myName = ref(localStorage.getItem('bma_name') || '')
  const hostToken = ref(localStorage.getItem('bma_hostToken') || null)
  const roomCode = ref(localStorage.getItem('bma_roomCode') || '')

  function saveIdentity() {
    localStorage.setItem('bma_name', myName.value)
    localStorage.setItem('bma_hostToken', hostToken.value || '')
    localStorage.setItem('bma_roomCode', roomCode.value)
  }

  // ── Room state ─────────────────────────────────────────────────────────────
  const room = ref(null)          // safeRoom object from server
  const error = ref('')
  const loading = ref(false)
  const view = ref('home')        // 'home' | 'create' | 'join' | 'lobby' | 'session'

  // ── Computed ───────────────────────────────────────────────────────────────
  const isHost = computed(() => !!hostToken.value)
  const currentMatch = computed(() => {
    if (!room.value) return null
    return room.value.matches[room.value.currentMatchIndex] ?? null
  })
  const nextMatch = computed(() => {
    if (!room.value) return null
    return room.value.matches[room.value.currentMatchIndex + 1] ?? null
  })
  const doneCnt = computed(() => room.value?.matches.filter(m => m.status === 'done').length ?? 0)
  const totalCnt = computed(() => room.value?.matches.length ?? 0)
  const progress = computed(() => totalCnt.value > 0 ? (doneCnt.value / totalCnt.value) * 100 : 0)

  // ── SSE management ─────────────────────────────────────────────────────────
  let sseHandle = null

  function applyUpdate(newRoom) {
    // Only apply if version is newer (ignore stale SSE events)
    if (!room.value || newRoom.version > room.value.version) {
      room.value = newRoom
      if (newRoom.started && view.value === 'lobby') {
        view.value = 'session'
      }
    }
  }

  function startSSE() {
    stopSSE()
    if (!roomCode.value) return
    sseHandle = openSSE(roomCode.value, room.value?.version ?? 0, applyUpdate)
  }

  function stopSSE() {
    sseHandle?.close()
    sseHandle = null
  }

  // ── Page visibility — resync on tab focus ──────────────────────────────────
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !roomCode.value) return
    try {
      const { room: fresh } = await api.getRoom(roomCode.value)
      applyUpdate(fresh)
      // Reconnect SSE if it dropped
      if (!sseHandle || sseHandle.closed) startSSE()
    } catch { /* best-effort */ }
  })

  // ── Actions ────────────────────────────────────────────────────────────────

  function setError(msg) { error.value = msg }
  function clearError() { error.value = '' }

  async function createRoom(playerName, format) {
    loading.value = true
    clearError()
    try {
      const { hostToken: token, room: newRoom } = await api.createRoom(playerName, format)
      myName.value = playerName
      hostToken.value = token
      roomCode.value = newRoom.code
      room.value = newRoom
      saveIdentity()
      view.value = 'lobby'
      startSSE()
    } catch (e) {
      setError(e.message)
    } finally {
      loading.value = false
    }
  }

  async function joinRoom(code, playerName) {
    loading.value = true
    clearError()
    try {
      const { room: newRoom } = await api.joinRoom(code, playerName)
      myName.value = playerName
      hostToken.value = null
      roomCode.value = code
      room.value = newRoom
      saveIdentity()
      view.value = newRoom.started ? 'session' : 'lobby'
      startSSE()
    } catch (e) {
      setError(e.message)
    } finally {
      loading.value = false
    }
  }

  async function setFormat(format) {
    clearError()
    try {
      const { room: updated } = await api.setFormat(
        roomCode.value, format, room.value.version, hostToken.value
      )
      room.value = updated
    } catch (e) {
      if (e.status === 409) {
        // Version conflict — refresh and retry
        const { room: fresh } = await api.getRoom(roomCode.value)
        room.value = fresh
      }
      setError(e.message)
    }
  }

  async function startSession() {
    loading.value = true
    clearError()
    try {
      const { room: updated } = await api.startSession(
        roomCode.value, room.value.version, hostToken.value
      )
      room.value = updated
      view.value = 'session'
    } catch (e) {
      setError(e.message)
    } finally {
      loading.value = false
    }
  }

  async function markMatchDone(winner) {
    clearError()
    try {
      const { room: updated } = await api.markMatchDone(
        roomCode.value, winner, room.value.version, hostToken.value
      )
      room.value = updated
    } catch (e) {
      if (e.status === 409) {
        const { room: fresh } = await api.getRoom(roomCode.value)
        room.value = fresh
      }
      setError(e.message)
    }
  }

  async function editMatch(team1, team2) {
    clearError()
    try {
      const { room: updated } = await api.editMatch(
        roomCode.value, team1, team2, room.value.version, hostToken.value
      )
      room.value = updated
    } catch (e) {
      if (e.status === 409) {
        const { room: fresh } = await api.getRoom(roomCode.value)
        room.value = fresh
      }
      setError(e.message)
    }
  }

  async function addMatches(count = 5) {
    clearError()
    try {
      const { room: updated } = await api.addMatches(
        roomCode.value, count, room.value.version, hostToken.value
      )
      room.value = updated
    } catch (e) {
      setError(e.message)
    }
  }

  function leaveRoom() {
    stopSSE()
    hostToken.value = null
    roomCode.value = ''
    room.value = null
    myName.value = ''
    view.value = 'home'
    localStorage.removeItem('bma_name')
    localStorage.removeItem('bma_hostToken')
    localStorage.removeItem('bma_roomCode')
  }

  // ── Restore session on page reload ─────────────────────────────────────────
  async function tryRestoreSession() {
    if (!roomCode.value) return
    try {
      const { room: fresh } = await api.getRoom(roomCode.value)
      room.value = fresh
      view.value = fresh.started ? 'session' : 'lobby'
      startSSE()
    } catch {
      // Room expired or not found — clear state
      leaveRoom()
    }
  }

  return {
    // State
    myName, hostToken, roomCode, room, error, loading, view,
    // Computed
    isHost, currentMatch, nextMatch, doneCnt, totalCnt, progress,
    // Actions
    createRoom, joinRoom, setFormat, startSession,
    markMatchDone, editMatch, addMatches,
    leaveRoom, tryRestoreSession, clearError,
  }
})
