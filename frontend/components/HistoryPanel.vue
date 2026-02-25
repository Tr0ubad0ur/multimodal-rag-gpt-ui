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
  <BaseCard :aria-busy="loading ? 'true' : 'false'">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('historyTitle') }}</h2>
      <BaseButton
        variant="secondary"
        size="sm"
        :disabled="loading"
        @click="emit('refresh')"
      >
        {{ t('refresh') }}
      </BaseButton>
    </div>

    <div class="mt-4 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
      <div v-if="loading && !items.length" class="space-y-2">
        <article v-for="idx in 4" :key="idx" class="rounded-xl border border-line bg-surface p-3">
          <BaseSkeleton :lines="2" />
        </article>
      </div>

      <div v-else-if="!items.length" class="rounded-xl border border-line bg-surface-muted/60 p-4 text-sm text-muted">
        <p>{{ t('noHistory') }}</p>
        <p class="mt-1 text-xs">{{ t('historyEmptyHint') }}</p>
      </div>

      <article
        v-for="item in items"
        :key="item.id"
        class="ui-fade-up rounded-xl border p-3 transition"
        :class="item.id === activeId ? 'border-brand/50 bg-brand-soft/70' : 'border-line bg-surface hover:border-line/80 hover:bg-surface-muted/70'"
      >
        <button class="w-full text-left" @click="emit('select', item)">
          <p class="line-clamp-2 text-sm font-medium text-foreground">{{ item.query }}</p>
          <p class="mt-1 text-xs text-muted">{{ new Date(item.created_at).toLocaleString() }}</p>
        </button>
        <BaseButton
          variant="danger"
          size="sm"
          class="mt-2"
          @click="emit('remove', item.id)"
        >
          {{ t('delete') }}
        </BaseButton>
      </article>
    </div>
  </BaseCard>
</template>
