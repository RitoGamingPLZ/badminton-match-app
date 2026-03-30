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
  const myName    = ref(localStorage.getItem('bma_name') || '')
  const hostToken = ref(localStorage.getItem('bma_hostToken') || null)
  const roomCode  = ref(localStorage.getItem('bma_roomCode') || '')

  function saveIdentity() {
    localStorage.setItem('bma_name', myName.value)
    localStorage.setItem('bma_hostToken', hostToken.value || '')
    localStorage.setItem('bma_roomCode', roomCode.value)
  }

  // ── Room state ─────────────────────────────────────────────────────────────
  const room    = ref(null)
  const error   = ref('')
  const loading = ref(false)
  // 'home' | 'lobby' | 'session' | 'editMatches'
  const view    = ref('home')

  // ── Computed ───────────────────────────────────────────────────────────────
  const isHost = computed(() => !!hostToken.value)

  const currentMatch = computed(() => {
    if (!room.value) return null
    return room.value.matches[room.value.currentMatchIndex] ?? null
  })

  const upcomingMatches = computed(() => {
    if (!room.value) return []
    return room.value.matches.slice(room.value.currentMatchIndex + 1).filter(m => m.status === 'pending')
  })

  const editableMatches = computed(() => {
    if (!room.value) return []
    return room.value.matches
      .map((m, i) => ({ ...m, index: i }))
      .filter(m => m.status === 'active' || m.status === 'pending')
  })

  const doneCnt    = computed(() => room.value?.matches.filter(m => m.status === 'done').length ?? 0)
  const totalCnt   = computed(() => room.value?.matches.length ?? 0)
  const progress   = computed(() => totalCnt.value > 0 ? (doneCnt.value / totalCnt.value) * 100 : 0)
  const canUndo    = computed(() => room.value?.canUndo ?? false)
  const opLog      = computed(() => room.value?.operationLog ?? [])

  // ── SSE management ─────────────────────────────────────────────────────────
  let sseHandle = null

  function applyUpdate(newRoom) {
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
      if (!sseHandle || sseHandle.closed) startSSE()
    } catch { /* best-effort */ }
  })

  // ── Actions ────────────────────────────────────────────────────────────────

  function setError(msg) { error.value = msg }
  function clearError()  { error.value = '' }

  async function createRoom(playerName, additionalPlayers = []) {
    loading.value = true
    clearError()
    try {
      const { hostToken: token, room: newRoom } = await api.createRoom(playerName, additionalPlayers)
      myName.value    = playerName
      hostToken.value = token
      roomCode.value  = newRoom.code
      room.value      = newRoom
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
      myName.value    = playerName
      hostToken.value = null
      roomCode.value  = code
      room.value      = newRoom
      saveIdentity()
      view.value = newRoom.started ? 'session' : 'lobby'
      startSSE()
    } catch (e) {
      setError(e.message)
    } finally {
      loading.value = false
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

  async function skipMatch(playerName, skipFrom = 'current') {
    clearError()
    try {
      const { room: updated } = await api.skipMatch(
        roomCode.value, playerName, room.value.version, skipFrom
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

  async function undo() {
    clearError()
    try {
      const { room: updated } = await api.undo(
        roomCode.value, room.value.version, hostToken.value
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

  async function editMatch(matchIndex, team1, team2) {
    clearError()
    try {
      const { room: updated } = await api.editMatch(
        roomCode.value, matchIndex, team1, team2, room.value.version, hostToken.value
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

  function openEditMatches() {
    view.value = 'editMatches'
  }

  function closeEditMatches() {
    view.value = 'session'
  }

  function leaveRoom() {
    stopSSE()
    hostToken.value = null
    roomCode.value  = ''
    room.value      = null
    myName.value    = ''
    view.value      = 'home'
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
      leaveRoom()
    }
  }

  return {
    // State
    myName, hostToken, roomCode, room, error, loading, view,
    // Computed
    isHost, currentMatch, upcomingMatches, editableMatches,
    doneCnt, totalCnt, progress, canUndo, opLog,
    // Actions
    createRoom, joinRoom, startSession,
    markMatchDone, skipMatch, undo, editMatch, addMatches,
    openEditMatches, closeEditMatches,
    leaveRoom, tryRestoreSession, clearError,
  }
})
