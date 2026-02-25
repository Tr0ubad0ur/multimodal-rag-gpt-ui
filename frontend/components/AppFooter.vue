<script setup lang="ts">
const config = useRuntimeConfig()
const { t } = useI18n()
</script>

<template>
  <footer class="mt-8 border-t border-line/80 bg-surface/70 p-4 text-sm text-foreground backdrop-blur-md">
    <div class="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
      <div class="max-w-3xl">
        <p class="font-semibold">{{ t('projectTitle') }}</p>
        <p class="mt-1 text-muted">
          {{ t('projectDesc') }}
        </p>
      </div>
      <div class="rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-strong">
        <a
          :href="config.public.apiBase"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:underline focus-visible:ring-0"
        >
          {{ t('apiLabel') }}: {{ config.public.apiBase }}
        </a>
      </div>
    </div>
  </footer>
</template>
