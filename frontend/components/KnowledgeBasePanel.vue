<script setup lang="ts">
const { t } = useI18n()

interface KnowledgeFolder {
  id: string
  name: string
  parentId: string | null
  createdAt: string
}

interface KnowledgeFile {
  id: string
  folderId: string
  name: string
  size: number
  type: string
  addedAt: string
}

const STORAGE_KEY = 'kb-tree-v3'
const ROOT_FOLDER_ID = 'root'

const folders = ref<KnowledgeFolder[]>([])
const files = ref<KnowledgeFile[]>([])
const selectedFolderId = ref(ROOT_FOLDER_ID)
const folderName = ref('')
const showCreateFolderInput = ref(false)
const dropzoneActive = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const errorText = ref('')

const getRootFolder = (): KnowledgeFolder => ({
  id: ROOT_FOLDER_ID,
  name: '__root__',
  parentId: null,
  createdAt: new Date().toISOString(),
})

const folderMap = computed(() => {
  const map = new Map<string, KnowledgeFolder>()
  for (const folder of folders.value) {
    map.set(folder.id, folder)
  }
  return map
})

const currentFolder = computed(() => folderMap.value.get(selectedFolderId.value) ?? getRootFolder())

const currentPath = computed(() => {
  const labels: string[] = [t('kbRootFolder')]
  let pointer = currentFolder.value

  while (pointer && pointer.id !== ROOT_FOLDER_ID) {
    labels.unshift(pointer.name)
    pointer = pointer.parentId ? folderMap.value.get(pointer.parentId) ?? null : null
  }

  return labels.join(' / ')
})

const childFolders = computed(() => {
  return folders.value
    .filter((folder) => folder.parentId === selectedFolderId.value && folder.id !== ROOT_FOLDER_ID)
    .sort((a, b) => a.name.localeCompare(b.name))
})

const selectedFolderFiles = computed(() => {
  return files.value
    .filter((file) => file.folderId === selectedFolderId.value)
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
})

const canGoUp = computed(() => selectedFolderId.value !== ROOT_FOLDER_ID)

const parseFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const persistState = () => {
  if (!import.meta.client) {
    return
  }

  const payload = {
    folders: folders.value,
    files: files.value,
    selectedFolderId: selectedFolderId.value,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

const ensureRootFolder = () => {
  if (!folders.value.some((folder) => folder.id === ROOT_FOLDER_ID)) {
    folders.value.unshift(getRootFolder())
  }
}

const loadState = () => {
  if (!import.meta.client) {
    return
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    folders.value = [getRootFolder()]
    return
  }

  try {
    const parsed = JSON.parse(raw) as {
      folders?: KnowledgeFolder[]
      files?: KnowledgeFile[]
      selectedFolderId?: string
    }

    folders.value = Array.isArray(parsed.folders) ? parsed.folders : []
    files.value = Array.isArray(parsed.files) ? parsed.files : []
    ensureRootFolder()

    const candidate = parsed.selectedFolderId
    if (candidate && folders.value.some((folder) => folder.id === candidate)) {
      selectedFolderId.value = candidate
    } else {
      selectedFolderId.value = ROOT_FOLDER_ID
    }
  } catch {
    folders.value = [getRootFolder()]
    files.value = []
    selectedFolderId.value = ROOT_FOLDER_ID
  }
}

const createFolder = () => {
  errorText.value = ''
  const name = folderName.value.trim()
  if (!name) {
    return
  }

  const duplicate = folders.value.some(
    (folder) => folder.parentId === selectedFolderId.value && folder.name.toLowerCase() === name.toLowerCase()
  )
  if (duplicate) {
    errorText.value = t('kbFolderExists')
    return
  }

  const newFolder: KnowledgeFolder = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    parentId: selectedFolderId.value,
    createdAt: new Date().toISOString(),
  }

  folders.value.push(newFolder)
  folderName.value = ''
  showCreateFolderInput.value = false
  persistState()
}

const handleCreateFolderClick = () => {
  if (!showCreateFolderInput.value) {
    showCreateFolderInput.value = true
    return
  }

  if (!folderName.value.trim()) {
    showCreateFolderInput.value = false
    errorText.value = ''
    return
  }

  createFolder()
}

const openFolder = (folderId: string) => {
  selectedFolderId.value = folderId
  persistState()
}

const goUp = () => {
  if (!canGoUp.value) {
    return
  }

  const parentId = currentFolder.value.parentId ?? ROOT_FOLDER_ID
  selectedFolderId.value = parentId
  persistState()
}

const collectDescendantFolderIds = (folderId: string): Set<string> => {
  const ids = new Set<string>([folderId])
  let changed = true

  while (changed) {
    changed = false
    for (const folder of folders.value) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        changed = true
      }
    }
  }

  return ids
}

const deleteFolder = (folderId: string) => {
  if (folderId === ROOT_FOLDER_ID) {
    return
  }

  const subtreeIds = collectDescendantFolderIds(folderId)
  folders.value = folders.value.filter((folder) => !subtreeIds.has(folder.id))
  files.value = files.value.filter((file) => !subtreeIds.has(file.folderId))

  if (subtreeIds.has(selectedFolderId.value)) {
    selectedFolderId.value = ROOT_FOLDER_ID
  }

  persistState()
}

const addFilesToSelectedFolder = (incomingFiles: FileList | null) => {
  if (!incomingFiles || !incomingFiles.length) {
    return
  }

  errorText.value = ''
  const prepared: KnowledgeFile[] = []

  for (const file of Array.from(incomingFiles)) {
    prepared.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      folderId: selectedFolderId.value,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      addedAt: new Date().toISOString(),
    })
  }

  files.value.unshift(...prepared)
  persistState()
}

const onFileInputChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  addFilesToSelectedFolder(target.files)
  target.value = ''
}

const openFilePicker = () => {
  fileInput.value?.click()
}

const onDrop = (event: DragEvent) => {
  event.preventDefault()
  dropzoneActive.value = false
  addFilesToSelectedFolder(event.dataTransfer?.files ?? null)
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
  dropzoneActive.value = true
}

const onDragLeave = () => {
  dropzoneActive.value = false
}

const removeFile = (id: string) => {
  files.value = files.value.filter((file) => file.id !== id)
  persistState()
}

onMounted(() => {
  loadState()
})
</script>

<template>
  <BaseCard>
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('kbTitle') }}</h2>
    </div>

    <div class="mt-3 rounded-xl border border-line bg-surface-muted/40 p-3">
      <div class="flex items-center justify-between gap-2">
        <p class="truncate text-xs font-semibold text-muted">{{ currentPath }}</p>
        <div class="flex items-center gap-1">
          <BaseButton size="sm" variant="secondary" @click="handleCreateFolderClick">
            +
          </BaseButton>
          <BaseButton size="sm" variant="secondary" :disabled="!canGoUp" @click="goUp">
            &larr;
          </BaseButton>
        </div>
      </div>

      <div v-if="showCreateFolderInput" class="mt-2">
        <BaseInput
          v-model="folderName"
          :placeholder="t('kbFolderPlaceholder')"
          @keydown.enter.prevent="createFolder"
        />
      </div>

      <div class="mt-3">
        <div v-if="childFolders.length" class="max-h-[11rem] space-y-2 overflow-y-auto pr-1">
          <article
            v-for="folder in childFolders"
            :key="folder.id"
            class="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2"
          >
            <button class="min-w-0 flex-1 text-left text-sm text-foreground" @click="openFolder(folder.id)">
              <span class="block truncate">{{ folder.name }}</span>
            </button>
            <BaseButton size="sm" variant="danger" @click="deleteFolder(folder.id)">
              -
            </BaseButton>
          </article>
        </div>

        <p v-else class="mt-2 text-sm text-muted">{{ t('kbNoSubfolders') }}</p>
      </div>
    </div>

    <div class="mt-3 rounded-xl border border-line bg-surface-muted/40 p-3">
      <div v-if="selectedFolderFiles.length" class="max-h-[10rem] space-y-2 overflow-y-auto pr-1">
        <article
          v-for="file in selectedFolderFiles"
          :key="file.id"
          class="rounded-lg border border-line bg-surface p-2"
        >
          <p class="truncate text-sm text-foreground">{{ file.name }}</p>
          <p class="text-xs text-muted">{{ parseFileSize(file.size) }} · {{ new Date(file.addedAt).toLocaleString() }}</p>
          <BaseButton size="sm" variant="danger" class="mt-2" @click="removeFile(file.id)">
            {{ t('delete') }}
          </BaseButton>
        </article>
      </div>

      <p v-else class="mt-2 text-sm text-muted">{{ t('kbNoFilesInFolder') }}</p>
    </div>

    <div
      class="mt-3 cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition"
      :class="dropzoneActive ? 'border-brand bg-brand-soft/45' : 'border-line bg-surface-muted/50 hover:border-brand/50'"
      role="button"
      tabindex="0"
      @click="openFilePicker"
      @keydown.enter.prevent="openFilePicker"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <p class="text-sm font-medium text-foreground">{{ t('kbDropzoneTitle') }}</p>
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="onFileInputChange"
      >
    </div>

    <BaseAlert v-if="errorText" tone="danger" class="mt-3" role="alert">
      {{ errorText }}
    </BaseAlert>
  </BaseCard>
</template>
