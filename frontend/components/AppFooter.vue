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
        <div class="grid gap-2 px-3 py-1 text-xs font-medium text-brand-strong">
          <a href="http://127.0.0.1:18000/docs" target="_blank" rel="noopener noreferrer" class="hover:underline">{{ t('apiLabel') }}</a>
          <a href="http://localhost:6333/dashboard#/collections" target="_blank" rel="noopener noreferrer" class="hover:underline">Qdrant</a>
          <a href="http://127.0.0.1:54323/project/default" target="_blank" rel="noopener noreferrer" class="hover:underline">Supabase</a>
          <a href="http://localhost:9090" target="_blank" rel="noopener noreferrer" class="hover:underline">Prometheus</a>
          <a href="http://localhost:3001" target="_blank" rel="noopener noreferrer" class="hover:underline">Grafana (admin/admin)</a>
          <a href="https://tr0ubad0ur.github.io/multimodal-rag-gpt/" target="_blank" rel="noopener noreferrer" class="hover:underline">Backend documentation</a>
          <a href="https://tr0ubad0ur.github.io/multimodal-rag-gpt/FAQ/" target="_blank" rel="noopener noreferrer" class="hover:underline">FAQ</a>
        </div>
      </div>
    </div>
  </footer>
</template>
