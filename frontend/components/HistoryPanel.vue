<script setup lang="ts">
import type { HistoryItem } from '~/types/api'

const { t } = useI18n()
const openMenuId = ref<number | null>(null)

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

const toggleItemMenu = (id: number) => {
  openMenuId.value = openMenuId.value === id ? null : id
}

const closeItemMenu = () => {
  openMenuId.value = null
}

const saveHistoryItem = (item: HistoryItem) => {
  const content = [
    `Created: ${new Date(item.created_at).toISOString()}`,
    '',
    'User query:',
    item.query,
    '',
    'Assistant answer:',
    item.answer,
  ].join('\n')

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chat-${item.id}.txt`
  a.click()
  URL.revokeObjectURL(url)
  closeItemMenu()
}

const onWindowClick = () => {
  closeItemMenu()
}

onMounted(() => {
  window.addEventListener('click', onWindowClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', onWindowClick)
})
</script>

<template>
  <BaseCard :aria-busy="loading ? 'true' : 'false'" class="flex h-full min-h-0 flex-col">
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

    <div class="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
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
        <div class="flex items-start gap-2">
          <button class="min-w-0 flex-1 text-left" @click="emit('select', item)">
            <p class="line-clamp-2 text-sm font-medium text-foreground">{{ item.query }}</p>
            <p class="mt-1 text-xs text-muted">{{ new Date(item.created_at).toLocaleString() }}</p>
          </button>

          <div class="relative">
            <button
              type="button"
              class="ui-btn-secondary h-8 w-8 !px-0"
              :aria-label="t('moreActions')"
              @click.stop="toggleItemMenu(item.id)"
            >
              ⋯
            </button>

            <div
              v-if="openMenuId === item.id"
              class="absolute right-0 top-9 z-10 min-w-40 rounded-lg border border-line bg-surface p-1 shadow-card"
              @click.stop
            >
              <button
                type="button"
                class="w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface-muted"
                @click="saveHistoryItem(item)"
              >
                {{ t('saveChat') }}
              </button>
              <button
                type="button"
                class="w-full rounded-md px-2 py-1.5 text-left text-sm text-danger transition hover:bg-danger-soft/70"
                @click="emit('remove', item.id); closeItemMenu()"
              >
                {{ t('delete') }}
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>
  </BaseCard>
</template>
