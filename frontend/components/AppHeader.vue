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
  <header class="border-b border-slate-200/80 bg-white/75 backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/60">
    <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">{{ t('headerTag') }}</p>
        <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{{ t('headerTitle') }}</h1>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          @click="toggleLocale"
        >
          {{ t('langLabel') }}: {{ locale.toUpperCase() }}
        </button>
        <button
          class="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          @click="toggleTheme"
        >
          {{ t('themeLabel') }}: {{ colorMode.preference }}
        </button>
        <span class="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
          Nuxt 4 / Vue 3
        </span>
      </div>
    </div>
  </header>
</template>
