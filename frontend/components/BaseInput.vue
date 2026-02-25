<script setup lang="ts">
const model = defineModel<string | number>()

withDefaults(
  defineProps<{
    type?: string
    placeholder?: string
    autocomplete?: string
    min?: string | number
    max?: string | number
    inputmode?: string
    disabled?: boolean
  }>(),
  {
    type: 'text',
    placeholder: '',
    autocomplete: undefined,
    min: undefined,
    max: undefined,
    inputmode: undefined,
    disabled: false,
  }
)
</script>

<template>
  <input
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :min="min"
    :max="max"
    :inputmode="inputmode"
    :disabled="disabled"
    class="ui-input"
  >
</template>
