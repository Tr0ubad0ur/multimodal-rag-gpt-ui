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
  <form class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60" @submit.prevent="submit">
    <label class="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{{ t('questionLabel') }}</label>
    <textarea
      v-model="query"
      rows="4"
      :placeholder="t('questionPlaceholder')"
      class="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-500 transition focus:ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    />

    <div class="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
      <input
        v-model="image"
        type="url"
        :placeholder="t('imagePlaceholder')"
        class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-500 transition focus:ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
      <label class="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
        top_k
        <input v-model.number="topK" type="number" min="1" max="50" class="w-16 bg-transparent outline-none">
      </label>
    </div>

    <button
      type="submit"
      class="mt-3 w-full rounded-xl bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-500 dark:hover:bg-cyan-400"
      :disabled="busy"
    >
      {{ busy ? t('processing') : t('sendQuery') }}
    </button>
  </form>
</template>
