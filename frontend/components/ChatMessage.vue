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
  <article class="ui-fade-up rounded-2xl border p-4 shadow-sm" :class="role === 'user' ? 'ml-auto max-w-3xl border-brand/45 bg-brand-soft' : 'mr-auto max-w-4xl border-line bg-surface'">
    <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em]" :class="role === 'user' ? 'text-brand-strong' : 'text-muted'">
      {{ role === 'user' ? t('you') : t('assistant') }}
    </p>
    <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{{ content }}</p>

    <details v-if="role === 'assistant' && docs?.length" class="mt-3 rounded-lg border border-line bg-surface-muted p-3 text-sm">
      <summary class="cursor-pointer font-medium text-foreground">{{ t('retrievedDocs') }} ({{ docs.length }})</summary>
      <ul class="mt-2 space-y-2">
        <li v-for="(doc, index) in docs" :key="index" class="rounded-md border border-line bg-surface p-2">
          <p class="mb-1 text-xs text-muted">{{ t('score') }}: {{ typeof doc.score === 'number' ? doc.score.toFixed(4) : 'n/a' }}</p>
          <p class="line-clamp-4 text-xs text-foreground">{{ doc.text || doc.content || JSON.stringify(doc.payload || doc) }}</p>
        </li>
      </ul>
    </details>
  </article>
</template>
