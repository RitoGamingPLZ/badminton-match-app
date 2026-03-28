<template>
  <div class="grid grid-cols-3 gap-2 mb-3">
    <div
      v-for="opt in options"
      :key="opt.value"
      class="py-3 px-1.5 rounded-xl border-2 cursor-pointer text-center transition-all select-none"
      :class="modelValue === opt.value
        ? 'border-green-600 bg-green-100'
        : 'border-slate-200 bg-white hover:border-slate-300'"
      @click="$emit('update:modelValue', opt.value)"
    >
      <span class="block text-[1.4rem] mb-1">{{ opt.icon }}</span>
      <span
        class="text-[0.78rem] font-semibold"
        :class="modelValue === opt.value ? 'text-green-700' : 'text-slate-500'"
      >{{ opt.label }}</span>
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
