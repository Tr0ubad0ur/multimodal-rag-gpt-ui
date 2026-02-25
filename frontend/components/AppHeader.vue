<script setup lang="ts">
const { t, locale, setLocale } = useI18n()
const colorMode = useColorMode()

const nextMode = () => {
  const order = ['system', 'light', 'dark'] as const
  const index = order.indexOf(colorMode.preference as (typeof order)[number])
  return order[(index + 1) % order.length]
}

const toggleTheme = () => {
  colorMode.preference = nextMode()
}

const toggleLocale = () => {
  setLocale(locale.value === 'ru' ? 'en' : 'ru')
}
</script>

<template>
  <header class="border-b border-line/80 bg-surface/80 backdrop-blur-md">
    <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{{ t('headerTag') }}</p>
        <h1 class="text-xl font-bold tracking-tight text-foreground">{{ t('headerTitle') }}</h1>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="ui-btn-secondary rounded-full px-3 py-1 text-xs"
          :aria-label="`${locale.toUpperCase()}`"
          @click="toggleLocale"
        >
          {{ locale.toUpperCase() }}
        </button>
        <button
          class="ui-btn-secondary rounded-full px-3 py-1 text-xs"
          :aria-label="`${colorMode.preference}`"
          @click="toggleTheme"
        >
          {{ colorMode.preference }}
        </button>
        <span class="rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-strong">
          Nuxt 4 / Vue 3
        </span>
      </div>
    </div>
  </header>
</template>
