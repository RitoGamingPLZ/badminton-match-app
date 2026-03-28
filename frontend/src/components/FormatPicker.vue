<template>
  <div class="fmt-grid" style="margin-bottom:12px;">
    <div
      v-for="opt in options"
      :key="opt.value"
      class="fmt-opt"
      :class="{ selected: modelValue === opt.value }"
      @click="$emit('update:modelValue', opt.value)"
    >
      <span class="icon">{{ opt.icon }}</span>
      <span class="label">{{ opt.label }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({ modelValue: String })
defineEmits(['update:modelValue'])

const options = [
  { value: 'doubles', icon: '👥', label: 'Doubles' },
  { value: 'singles', icon: '🧍', label: 'Singles' },
  { value: 'both',    icon: '🔀', label: 'Both'    },
]
</script>
