<script setup lang="ts">
const { t } = useI18n()

interface AskPayload {
  query: string
  top_k: number
}

defineProps<{
  busy?: boolean
}>()

const emit = defineEmits<{
  send: [payload: AskPayload]
}>()

const query = ref('')
const modelMenuOpen = ref(false)
const selectedModel = ref('gpt-default')
const selectedFileName = ref('')
const isDragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const modelOptions = [
  { value: 'gpt-default', label: 'GPT Default' },
  { value: 'fast-lite', label: 'Fast Lite' },
  { value: 'deep-reason', label: 'Deep Reason' },
]

const selectedModelLabel = computed(() => {
  return modelOptions.find((option) => option.value === selectedModel.value)?.label ?? 'GPT Default'
})

const submit = () => {
  const trimmed = query.value.trim()
  if (!trimmed) {
    return
  }

  emit('send', {
    query: trimmed,
    top_k: 5,
  })

  query.value = ''
}

const toggleModelMenu = () => {
  modelMenuOpen.value = !modelMenuOpen.value
}

const pickModel = (value: string) => {
  selectedModel.value = value
  modelMenuOpen.value = false
}

const openFilePicker = () => {
  fileInput.value?.click()
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  selectedFileName.value = file?.name ?? ''
  target.value = ''
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = true
}

const onDragLeave = () => {
  isDragOver.value = false
}

const onDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  selectedFileName.value = file?.name ?? ''
}

const clearSelectedFile = () => {
  selectedFileName.value = ''
}
</script>

<template>
  <form
    class="ui-card p-3 transition"
    :class="isDragOver ? 'border-brand bg-brand-soft/40' : ''"
    :aria-busy="busy ? 'true' : 'false'"
    @submit.prevent="submit"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="flex items-center gap-2">
      <input
        v-model="query"
        type="text"
        :placeholder="t('questionPlaceholder')"
        class="ui-input"
        :aria-label="t('questionLabel')"
      >
      <button
        type="submit"
        class="ui-btn-primary shrink-0"
        :disabled="busy"
      >
        {{ busy ? t('processing') : t('sendQuery') }}
      </button>
    </div>

    <div class="mt-2 flex items-center gap-2">
      <div class="relative">
        <button
          type="button"
          class="ui-btn-secondary h-9 w-9 !px-0"
          :title="t('composerModel')"
          :aria-label="t('composerModel')"
          @click="toggleModelMenu"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M7 12h10" />
            <path d="M10 17h4" />
          </svg>
        </button>

        <div
          v-if="modelMenuOpen"
          class="absolute left-0 top-10 z-10 min-w-40 rounded-lg border border-line bg-surface p-1 shadow-card"
        >
          <button
            v-for="option in modelOptions"
            :key="option.value"
            type="button"
            class="w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface-muted"
            @click="pickModel(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <button
        type="button"
        class="ui-btn-secondary h-9 w-9 !px-0"
        :title="t('composerAttach')"
        :aria-label="t('composerAttach')"
        @click="openFilePicker"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21.44 11.05l-8.49 8.49a6 6 0 1 1-8.49-8.49l8.49-8.49a4 4 0 1 1 5.66 5.66l-8.49 8.49a2 2 0 1 1-2.83-2.83l7.78-7.78" />
        </svg>
      </button>

      <input
        ref="fileInput"
        type="file"
        class="hidden"
        @change="onFileChange"
      >

      <div class="flex min-w-0 items-center gap-1 text-xs text-muted">
        <p class="truncate">
          {{ selectedModelLabel }}<span v-if="selectedFileName"> · {{ selectedFileName }}</span><span v-else> · {{ t('composerDropHint') }}</span>
        </p>
        <button
          v-if="selectedFileName"
          type="button"
          class="ui-btn-secondary h-6 w-6 shrink-0 !px-0 text-xs"
          :title="t('composerRemoveFile')"
          :aria-label="t('composerRemoveFile')"
          @click="clearSelectedFile"
        >
          ×
        </button>
      </div>
    </div>
  </form>
</template>
