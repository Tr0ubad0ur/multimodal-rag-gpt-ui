<script setup lang="ts">
const config = useRuntimeConfig()
const { t } = useI18n()
</script>

<template>
  <footer class="border-cyan-200 bg-cyan-50/70 p-4 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-900/20 dark:text-cyan-100">
    <div class="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
      <div>
        <p class="font-semibold">{{ t('projectTitle') }}</p>
        <p class="mt-1">
          {{ t('projectDesc') }}
        </p>
      </div>
      <div class="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
        <a
          :href="config.public.apiBase"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:underline"
        >
          {{ t('apiLabel') }}: {{ config.public.apiBase }}
        </a>
      </div>
    </div>
  </footer>
</template>
