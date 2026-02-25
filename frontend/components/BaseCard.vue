<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: string
    padded?: boolean
    muted?: boolean
  }>(),
  {
    as: 'section',
    padded: true,
    muted: false,
  }
)
</script>

<template>
  <component
    :is="as"
    class="ui-card"
    :class="[
      padded ? 'p-5' : '',
      muted ? 'bg-surface-muted/60' : '',
    ]"
  >
    <slot />
  </component>
</template>
