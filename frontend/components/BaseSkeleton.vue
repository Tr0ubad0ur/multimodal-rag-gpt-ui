<script setup lang="ts">
withDefaults(
  defineProps<{
    lines?: number
  }>(),
  {
    lines: 3,
  }
)
</script>

<template>
  <div class="space-y-2" aria-hidden="true">
    <div
      v-for="index in lines"
      :key="index"
      class="ui-skeleton h-3"
      :class="index === lines ? 'w-3/4' : 'w-full'"
    />
  </div>
</template>
