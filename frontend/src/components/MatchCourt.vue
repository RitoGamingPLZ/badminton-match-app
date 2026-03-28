<template>
  <div class="flex items-center gap-2.5">
    <!-- Team 1 -->
    <div
      class="flex-1 bg-white rounded-lg p-2.5 border-2 transition-colors"
      :class="match.winner === 1 ? 'border-green-600' : 'border-transparent'"
    >
      <div class="text-[0.68rem] font-bold text-slate-500 uppercase mb-1">Team 1</div>
      <div v-for="p in match.team1" :key="p" class="text-[0.88rem] font-semibold text-slate-800">{{ p }}</div>
    </div>

    <div class="text-[0.85rem] font-extrabold text-slate-400 shrink-0">VS</div>

    <!-- Team 2 -->
    <div
      class="flex-1 bg-white rounded-lg p-2.5 border-2 transition-colors"
      :class="match.winner === 2 ? 'border-green-600' : 'border-transparent'"
    >
      <div class="text-[0.68rem] font-bold text-slate-500 uppercase mb-1">Team 2</div>
      <div v-for="p in match.team2" :key="p" class="text-[0.88rem] font-semibold text-slate-800">{{ p }}</div>
    </div>
  </div>
</template>

<script setup>
defineProps({ match: { type: Object, required: true } })
</script>
