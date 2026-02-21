<script setup lang="ts">
import type { RetrievedDoc } from '~/types/api'

const { t } = useI18n()

defineProps<{
  role: 'user' | 'assistant'
  content: string
  docs?: RetrievedDoc[]
}>()
</script>

<template>
  <article class="rounded-2xl border p-4 shadow-sm" :class="role === 'user' ? 'ml-auto max-w-3xl border-cyan-300 bg-cyan-50 dark:border-cyan-900/60 dark:bg-cyan-900/20' : 'mr-auto max-w-4xl border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60'">
    <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em]" :class="role === 'user' ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-500 dark:text-slate-400'">
      {{ role === 'user' ? t('you') : t('assistant') }}
    </p>
    <p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">{{ content }}</p>

    <details v-if="role === 'assistant' && docs?.length" class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/80">
      <summary class="cursor-pointer font-medium text-slate-700 dark:text-slate-200">{{ t('retrievedDocs') }} ({{ docs.length }})</summary>
      <ul class="mt-2 space-y-2">
        <li v-for="(doc, index) in docs" :key="index" class="rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/60">
          <p class="mb-1 text-xs text-slate-500 dark:text-slate-400">{{ t('score') }}: {{ typeof doc.score === 'number' ? doc.score.toFixed(4) : 'n/a' }}</p>
          <p class="line-clamp-4 text-xs text-slate-700 dark:text-slate-200">{{ doc.text || doc.content || JSON.stringify(doc.payload || doc) }}</p>
        </li>
      </ul>
    </details>
  </article>
</template>
