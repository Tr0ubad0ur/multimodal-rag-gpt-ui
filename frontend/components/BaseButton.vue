<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset'
    variant?: 'primary' | 'secondary' | 'danger'
    size?: 'sm' | 'md'
    block?: boolean
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    type: 'button',
    variant: 'secondary',
    size: 'md',
    block: false,
    disabled: false,
    loading: false,
  }
)

const classes = computed(() => {
  const variantClass = {
    primary: 'ui-btn-primary',
    secondary: 'ui-btn-secondary',
    danger: 'ui-btn-danger',
  }[props.variant]

  const sizeClass = props.size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'
  return [variantClass, sizeClass, props.block ? 'w-full' : '']
})
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
  >
    <slot />
  </button>
</template>
