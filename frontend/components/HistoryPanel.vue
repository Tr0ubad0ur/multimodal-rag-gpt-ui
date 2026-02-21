<script setup lang="ts">
import type { HistoryItem } from '~/types/api'

const { t } = useI18n()

defineProps<{
  items: HistoryItem[]
  loading?: boolean
  activeId?: number | null
}>()

const emit = defineEmits<{
  refresh: []
  select: [item: HistoryItem]
  remove: [id: number]
}>()
</script>

<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{{ t('historyTitle') }}</h2>
      <button
        class="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        :disabled="loading"
        @click="emit('refresh')"
      >
        {{ t('refresh') }}
      </button>
    </div>

    <div class="mt-4 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
      <p v-if="!items.length" class="text-sm text-slate-500 dark:text-slate-400">{{ t('noHistory') }}</p>

      <article
        v-for="item in items"
        :key="item.id"
        class="rounded-xl border p-3 transition"
        :class="item.id === activeId ? 'border-cyan-400 bg-cyan-50/80 dark:border-cyan-500/60 dark:bg-cyan-900/20' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-600'"
      >
        <button class="w-full text-left" @click="emit('select', item)">
          <p class="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{{ item.query }}</p>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ new Date(item.created_at).toLocaleString() }}</p>
        </button>
        <button
          class="mt-2 rounded-md px-2 py-1 text-xs text-rose-700 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/30"
          @click="emit('remove', item.id)"
        >
          {{ t('delete') }}
        </button>
      </article>
    </div>
  </section>
</template>
