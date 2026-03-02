<script setup lang="ts">
const { t } = useI18n()

interface AskPayload {
  query: string
  top_k: number
  model: string
  attachment_id?: string
  attachment?: File
}

interface ModelOption {
  value: string
  label: string
}

const props = defineProps<{
  busy?: boolean
  uploadingAttachment?: boolean
  uploadedAttachmentId?: string | null
  uploadedAttachmentName?: string | null
  modelOptions?: ModelOption[]
  filterMode?: 'none' | 'folders' | 'files'
  filterControlsDisabled?: boolean
  selectedFolderCount?: number
  selectedFileCount?: number
}>()

const emit = defineEmits<{
  send: [payload: AskPayload]
  uploadAttachment: [file: File]
  clearUploadedAttachment: []
  filterModeChange: [mode: 'none' | 'folders' | 'files']
}>()

const query = ref('')
const modelMenuOpen = ref(false)
const selectedModel = ref('gpt-default')
const directAttachment = ref<File | null>(null)
const isDragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const fallbackModelOptions: ModelOption[] = [
  { value: 'gpt-default', label: 'GPT Default' },
  { value: 'fast-lite', label: 'Fast Lite' },
  { value: 'deep-reason', label: 'Deep Reason' },
]

const modelOptions = computed(() => {
  return props.modelOptions?.length ? props.modelOptions : fallbackModelOptions
})

const selectedModelLabel = computed(() => {
  return modelOptions.value.find((option) => option.value === selectedModel.value)?.label ?? 'GPT Default'
})

watch(
  modelOptions,
  (options) => {
    if (!options.some((option) => option.value === selectedModel.value)) {
      selectedModel.value = options[0]?.value ?? 'gpt-default'
    }
  },
  { immediate: true }
)

const submit = () => {
  const trimmed = query.value.trim()
  if (!trimmed) {
    return
  }

  const payload: AskPayload = {
    query: trimmed,
    top_k: 8,
    model: selectedModel.value,
  }

  if (directAttachment.value) {
    payload.attachment = directAttachment.value
  } else if (props.uploadedAttachmentId) {
    payload.attachment_id = props.uploadedAttachmentId
  }

  emit('send', {
    ...payload,
  })

  query.value = ''
  directAttachment.value = null
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
  if (file) {
    directAttachment.value = null
    emit('uploadAttachment', file)
  }
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
  if (!file) {
    return
  }
  emit('clearUploadedAttachment')
  directAttachment.value = file
}

const clearSelectedFile = () => {
  if (directAttachment.value) {
    directAttachment.value = null
    return
  }
  emit('clearUploadedAttachment')
}

const selectedFileName = computed(() => {
  if (directAttachment.value) {
    return directAttachment.value.name
  }
  return props.uploadedAttachmentName ?? ''
})

const isUploading = computed(() => Boolean(props.uploadingAttachment))
const currentFilterMode = computed(() => props.filterMode ?? 'none')
const selectedFolderCount = computed(() => props.selectedFolderCount ?? 0)
const selectedFileCount = computed(() => props.selectedFileCount ?? 0)
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
    <div class="mb-2 flex flex-wrap gap-2">
      <BaseButton
        size="sm"
        :variant="currentFilterMode === 'none' ? 'primary' : 'secondary'"
        @click="emit('filterModeChange', 'none')"
      >
        Без фильтра
      </BaseButton>
      <BaseButton
        size="sm"
        :variant="currentFilterMode === 'folders' ? 'primary' : 'secondary'"
        :disabled="filterControlsDisabled"
        @click="emit('filterModeChange', 'folders')"
      >
        По папкам
      </BaseButton>
      <BaseButton
        size="sm"
        :variant="currentFilterMode === 'files' ? 'primary' : 'secondary'"
        :disabled="filterControlsDisabled"
        @click="emit('filterModeChange', 'files')"
      >
        По файлам
      </BaseButton>
    </div>
    <p class="mb-2 text-xs text-muted">
      {{ t('selectedFilters', { folders: selectedFolderCount, files: selectedFileCount }) }}
    </p>

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
        :disabled="busy || isUploading"
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
        :disabled="isUploading"
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
          <span v-if="isUploading"> · {{ t('processing') }}</span>
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
