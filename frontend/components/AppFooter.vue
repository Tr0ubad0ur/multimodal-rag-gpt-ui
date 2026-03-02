<script setup lang="ts">
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
      <div class="flex flex-col items-start gap-2">
        <div class="rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-strong">
          <a
            href="http://127.0.0.1:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:underline focus-visible:ring-0"
          >
            {{ t('apiLabel') }}: http://127.0.0.1:8000/docs
          </a>
        </div>
        <div class="grid gap-1 text-xs text-muted">
          <a href="http://localhost:6333/dashboard#/collections" target="_blank" rel="noopener noreferrer" class="hover:underline">Qdrant: http://localhost:6333/dashboard#/collections</a>
          <a href="http://127.0.0.1:54323/project/default" target="_blank" rel="noopener noreferrer" class="hover:underline">Supabase: http://127.0.0.1:54323/project/default</a>
          <a href="http://localhost:9090" target="_blank" rel="noopener noreferrer" class="hover:underline">Prometheus: http://localhost:9090</a>
          <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer" class="hover:underline">Grafana: http://localhost:3000 (admin/admin)</a>
          <a href="https://tr0ubad0ur.github.io/multimodal-rag-gpt/" target="_blank" rel="noopener noreferrer" class="hover:underline">GitHub: https://tr0ubad0ur.github.io/multimodal-rag-gpt/</a>
        </div>
        <span class="rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-strong">
          Nuxt 4 / Vue 3
        </span>
      </div>
    </div>
  </footer>
</template>
