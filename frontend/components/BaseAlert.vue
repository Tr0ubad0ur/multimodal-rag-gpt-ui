<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    tone?: 'danger' | 'info'
  }>(),
  {
    tone: 'info',
  }
)

const classes = computed(() => {
  if (props.tone === 'danger') {
    return 'border-danger/35 bg-danger-soft text-danger'
  }

  return 'border-brand/30 bg-brand-soft text-brand-strong'
})
</script>

<template>
  <div class="rounded-xl border px-3 py-2 text-sm" :class="classes">
    <slot />
  </div>
</template>
