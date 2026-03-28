<template>
  <div class="court">
    <div class="team" :class="{ winner: match.winner === 1 }">
      <div class="team-lbl">Team 1</div>
      <div v-for="p in match.team1" :key="p" class="team-player">{{ p }}</div>
    </div>
    <div class="vs">VS</div>
    <div class="team" :class="{ winner: match.winner === 2 }">
      <div class="team-lbl">Team 2</div>
      <div v-for="p in match.team2" :key="p" class="team-player">{{ p }}</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  match: { type: Object, required: true },
})
</script>
