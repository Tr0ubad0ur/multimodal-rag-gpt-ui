<script setup lang="ts">
const { t } = useI18n()

interface AskPayload {
  query: string
  top_k: number
  image?: string
}

defineProps<{
  busy?: boolean
}>()

const emit = defineEmits<{
  send: [payload: AskPayload]
}>()

const query = ref('')
const image = ref('')
const topK = ref(5)

const submit = () => {
  const trimmed = query.value.trim()
  if (!trimmed) {
    return
  }

  emit('send', {
    query: trimmed,
    top_k: topK.value,
    image: image.value.trim() || undefined,
  })

  query.value = ''
}
</script>

<template>
  <form class="ui-card p-4" :aria-busy="busy ? 'true' : 'false'" @submit.prevent="submit">
    <label class="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted">{{ t('questionLabel') }}</label>
    <textarea
      v-model="query"
      rows="4"
      :placeholder="t('questionPlaceholder')"
      class="ui-input resize-none"
      :aria-label="t('questionLabel')"
    />

    <div class="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
      <input
        v-model="image"
        type="url"
        :placeholder="t('imagePlaceholder')"
        class="ui-input"
        :aria-label="t('imagePlaceholder')"
      >
      <label class="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground">
        top_k
        <input v-model.number="topK" type="number" min="1" max="50" class="w-16 bg-transparent text-right outline-none" aria-label="top_k">
      </label>
    </div>

    <button
      type="submit"
      class="ui-btn-primary mt-3 w-full"
      :disabled="busy"
    >
      {{ busy ? t('processing') : t('sendQuery') }}
    </button>
  </form>
</template>
