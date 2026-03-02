<script setup lang="ts">
interface KnowledgeFolder {
  id: string
  name: string
  parentId: string | null
}

interface KnowledgeFile {
  id: string
  folderId: string
  name: string
  size: number
  mime: string
  createdAt: string
}

interface KbFiltersPayload {
  mode: 'none' | 'folders' | 'files'
  folderIds: string[]
  fileIds: string[]
}

const ROOT_FOLDER_ID = 'root'

const { t } = useI18n()
const { isAuthenticated } = useAuth()
const {
  getKbTree,
  createKbFolder,
  deleteKbFolder,
  moveKbFolder,
  getKbFiles,
  linkKbFile,
  deleteKbFile,
  uploadFile,
} = useApi()

const props = withDefaults(
  defineProps<{
    activeMode?: 'none' | 'folders' | 'files'
  }>(),
  {
    activeMode: 'none',
  }
)

const emit = defineEmits<{
  filtersChange: [payload: KbFiltersPayload]
}>()

const folders = ref<KnowledgeFolder[]>([])
const filesByFolder = ref<Record<string, KnowledgeFile[]>>({})
const selectedFolderId = ref(ROOT_FOLDER_ID)
const folderName = ref('')
const showCreateFolderInput = ref(false)
const dropzoneActive = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const errorText = ref('')
const treeBusy = ref(false)
const filesBusy = ref(false)
const actionBusy = ref(false)
const uploadBusy = ref(false)
const selectedFolderFilterIds = ref<string[]>([])
const selectedFileFilterIds = ref<string[]>([])
const filterMode = ref<'none' | 'folders' | 'files'>('none')
const openFolderMenuId = ref<string | null>(null)
const openFileMenuId = ref<string | null>(null)
const draggingItem = ref<{ type: 'folder' | 'file'; id: string } | null>(null)
const dragOverFolderId = ref<string | null>(null)
const dragOverRoot = ref(false)

const getRootFolder = (): KnowledgeFolder => ({
  id: ROOT_FOLDER_ID,
  name: '__root__',
  parentId: null,
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
  return (filesByFolder.value[selectedFolderId.value] ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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

const downloadText = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const collectDescendantFolderIds = (folderId: string): Set<string> => {
  const descendants = new Set<string>([folderId])
  let changed = true
  while (changed) {
    changed = false
    for (const folder of folders.value) {
      if (folder.parentId && descendants.has(folder.parentId) && !descendants.has(folder.id)) {
        descendants.add(folder.id)
        changed = true
      }
    }
  }
  return descendants
}

const ensureFolderCache = (folderId: string) => {
  if (!filesByFolder.value[folderId]) {
    filesByFolder.value[folderId] = []
  }
}

const parseFolder = (item: unknown, parentIdFallback: string | null = null): KnowledgeFolder | null => {
  if (!item || typeof item !== 'object') {
    return null
  }

  const source = item as Record<string, unknown>
  const id = source.id ?? source.folder_id
  const name = source.name ?? source.title
  const parentRaw = (source.parent_id ?? source.parentId ?? parentIdFallback) as string | null
  const parentId = parentRaw ?? ROOT_FOLDER_ID

  if (typeof id !== 'string' || typeof name !== 'string') {
    return null
  }

  return {
    id,
    name,
    parentId,
  }
}

const parseFile = (item: unknown, fallbackFolderId: string): KnowledgeFile | null => {
  if (!item || typeof item !== 'object') {
    return null
  }

  const source = item as Record<string, unknown>
  const id = source.file_id ?? source.id
  const name = source.filename ?? source.name

  if (typeof id !== 'string' || typeof name !== 'string') {
    return null
  }

  return {
    id,
    folderId: typeof source.folder_id === 'string' ? source.folder_id : fallbackFolderId,
    name,
    size: typeof source.size === 'number' ? source.size : 0,
    mime: typeof source.mime === 'string' ? source.mime : 'application/octet-stream',
    createdAt: typeof source.created_at === 'string' ? source.created_at : new Date().toISOString(),
  }
}

const parseTreeFolders = (payload: unknown): KnowledgeFolder[] => {
  const byId = new Map<string, KnowledgeFolder>()

  const visit = (node: unknown, parentId: string | null = ROOT_FOLDER_ID) => {
    const parsed = parseFolder(node, parentId)
    if (!parsed || parsed.id === ROOT_FOLDER_ID) {
      return
    }
    byId.set(parsed.id, parsed)

    const source = node as Record<string, unknown>
    const children = source.children ?? source.folders ?? source.items
    if (Array.isArray(children)) {
      for (const child of children) {
        visit(child, parsed.id)
      }
    }
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  const source = payload as Record<string, unknown>
  const flatFolders = source.folders
  if (Array.isArray(flatFolders)) {
    for (const item of flatFolders) {
      const parsed = parseFolder(item)
      if (parsed && parsed.id !== ROOT_FOLDER_ID) {
        byId.set(parsed.id, parsed)
      }
    }
  }

  const nestedTree = source.tree
  if (Array.isArray(nestedTree)) {
    for (const node of nestedTree) {
      visit(node, ROOT_FOLDER_ID)
    }
  }

  return Array.from(byId.values())
}

const parseFilesList = (payload: unknown, fallbackFolderId: string): KnowledgeFile[] => {
  const list = (() => {
    if (Array.isArray(payload)) {
      return payload
    }
    if (!payload || typeof payload !== 'object') {
      return []
    }
    const source = payload as Record<string, unknown>
    if (Array.isArray(source.files)) {
      return source.files
    }
    if (Array.isArray(source.data)) {
      return source.data
    }
    if (Array.isArray(source.items)) {
      return source.items
    }
    return []
  })()

  return list
    .map((item) => parseFile(item, fallbackFolderId))
    .filter((item): item is KnowledgeFile => Boolean(item))
}

const emitFilters = () => {
  emit('filtersChange', {
    mode: filterMode.value,
    folderIds: filterMode.value === 'folders' ? selectedFolderFilterIds.value : [],
    fileIds: filterMode.value === 'files' ? selectedFileFilterIds.value : [],
  })
}

const pruneFilters = () => {
  const validFolderIds = new Set(folders.value.map((folder) => folder.id))
  const validFileIds = new Set(
    Object.values(filesByFolder.value)
      .flat()
      .map((file) => file.id)
  )

  selectedFolderFilterIds.value = selectedFolderFilterIds.value.filter((id) => validFolderIds.has(id))
  selectedFileFilterIds.value = selectedFileFilterIds.value.filter((id) => validFileIds.has(id))
  if (filterMode.value === 'folders' && !selectedFolderFilterIds.value.length) {
    filterMode.value = 'none'
  }
  if (filterMode.value === 'files' && !selectedFileFilterIds.value.length) {
    filterMode.value = 'none'
  }
}

const loadFilesForFolder = async (folderId: string) => {
  if (!isAuthenticated.value) {
    return
  }

  filesBusy.value = true
  try {
    const payload = await getKbFiles(folderId === ROOT_FOLDER_ID ? null : folderId)
    filesByFolder.value[folderId] = parseFilesList(payload, folderId)
    pruneFilters()
    emitFilters()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    errorText.value = `${t('errorPrefix')}: ${message}`
  } finally {
    filesBusy.value = false
  }
}

const loadTree = async () => {
  if (!isAuthenticated.value) {
    folders.value = []
    filesByFolder.value = { [ROOT_FOLDER_ID]: [] }
    selectedFolderId.value = ROOT_FOLDER_ID
    selectedFolderFilterIds.value = []
    selectedFileFilterIds.value = []
    filterMode.value = 'none'
    emitFilters()
    return
  }

  treeBusy.value = true
  errorText.value = ''
  try {
    const payload = await getKbTree()
    folders.value = parseTreeFolders(payload)
    const rootFiles = parseFilesList(
      (payload as Record<string, unknown>)?.root_files ?? (payload as Record<string, unknown>)?.files,
      ROOT_FOLDER_ID
    )
    filesByFolder.value[ROOT_FOLDER_ID] = rootFiles
    ensureFolderCache(selectedFolderId.value)

    if (
      selectedFolderId.value !== ROOT_FOLDER_ID &&
      !folders.value.some((folder) => folder.id === selectedFolderId.value)
    ) {
      selectedFolderId.value = ROOT_FOLDER_ID
    }

    await loadFilesForFolder(selectedFolderId.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    errorText.value = `${t('errorPrefix')}: ${message}`
  } finally {
    treeBusy.value = false
  }
}

const createFolder = async () => {
  const name = folderName.value.trim()
  if (!name || !isAuthenticated.value) {
    return
  }

  actionBusy.value = true
  errorText.value = ''
  try {
    await createKbFolder({
      name,
      ...(selectedFolderId.value === ROOT_FOLDER_ID ? {} : { parent_id: selectedFolderId.value }),
    })
    folderName.value = ''
    showCreateFolderInput.value = false
    await loadTree()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    errorText.value = `${t('errorPrefix')}: ${message}`
  } finally {
    actionBusy.value = false
  }
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

  void createFolder()
}

const openFolder = (folderId: string) => {
  selectedFolderId.value = folderId
  if (!filesByFolder.value[folderId]) {
    void loadFilesForFolder(folderId)
  }
}

const goUp = () => {
  if (!canGoUp.value) {
    return
  }

  const parentId = currentFolder.value.parentId ?? ROOT_FOLDER_ID
  selectedFolderId.value = parentId
  if (!filesByFolder.value[parentId]) {
    void loadFilesForFolder(parentId)
  }
}

const deleteFolder = async (folderId: string) => {
  if (!isAuthenticated.value || folderId === ROOT_FOLDER_ID) {
    return
  }

  actionBusy.value = true
  errorText.value = ''
  try {
    await deleteKbFolder(folderId)
    if (selectedFolderId.value === folderId) {
      selectedFolderId.value = ROOT_FOLDER_ID
    }
    await loadTree()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    errorText.value = `${t('errorPrefix')}: ${message}`
  } finally {
    actionBusy.value = false
  }
}

const saveFolder = (folder: KnowledgeFolder) => {
  const content = [
    `Folder ID: ${folder.id}`,
    `Name: ${folder.name}`,
    `Parent ID: ${folder.parentId ?? 'root'}`,
  ].join('\n')
  downloadText(`folder-${folder.name}.txt`, content)
  openFolderMenuId.value = null
}

const addFilesToSelectedFolder = async (incomingFiles: FileList | null) => {
  if (!isAuthenticated.value || !incomingFiles?.length) {
    return
  }

  uploadBusy.value = true
  errorText.value = ''
  try {
    const folderId = selectedFolderId.value === ROOT_FOLDER_ID ? null : selectedFolderId.value
    for (const file of Array.from(incomingFiles)) {
      const uploaded = await uploadFile(file)
      await linkKbFile(
        folderId
          ? {
              file_id: uploaded.file_id,
              folder_id: folderId,
            }
          : {
              file_id: uploaded.file_id,
            }
      )
    }

    await loadTree()
    await loadFilesForFolder(selectedFolderId.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    errorText.value = `${t('errorPrefix')}: ${message}`
  } finally {
    uploadBusy.value = false
  }
}

const onFileInputChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  void addFilesToSelectedFolder(target.files)
  target.value = ''
}

const openFilePicker = () => {
  if (!isAuthenticated.value || uploadBusy.value) {
    return
  }
  fileInput.value?.click()
}

const onDrop = (event: DragEvent) => {
  event.preventDefault()
  dropzoneActive.value = false
  void addFilesToSelectedFolder(event.dataTransfer?.files ?? null)
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
  dropzoneActive.value = true
}

const onDragLeave = () => {
  dropzoneActive.value = false
}

const removeFile = async (id: string) => {
  if (!isAuthenticated.value) {
    return
  }

  actionBusy.value = true
  errorText.value = ''
  try {
    await deleteKbFile(id)
    filesByFolder.value[selectedFolderId.value] = selectedFolderFiles.value.filter((file) => file.id !== id)
    selectedFileFilterIds.value = selectedFileFilterIds.value.filter((fileId) => fileId !== id)
    emitFilters()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    errorText.value = `${t('errorPrefix')}: ${message}`
  } finally {
    actionBusy.value = false
  }
}

const saveFile = (file: KnowledgeFile) => {
  const content = [
    `File ID: ${file.id}`,
    `Name: ${file.name}`,
    `Folder ID: ${file.folderId === ROOT_FOLDER_ID ? 'root' : file.folderId}`,
    `Size: ${file.size}`,
    `MIME: ${file.mime}`,
    `Created: ${file.createdAt}`,
  ].join('\n')
  downloadText(`file-${file.name}.txt`, content)
  openFileMenuId.value = null
}

const toggleFolderMenu = (folderId: string) => {
  openFileMenuId.value = null
  openFolderMenuId.value = openFolderMenuId.value === folderId ? null : folderId
}

const toggleFileMenu = (fileId: string) => {
  openFolderMenuId.value = null
  openFileMenuId.value = openFileMenuId.value === fileId ? null : fileId
}

const closeMenus = () => {
  openFolderMenuId.value = null
  openFileMenuId.value = null
}

const moveFileToFolder = async (fileId: string, targetFolderId: string | null) => {
  actionBusy.value = true
  errorText.value = ''
  try {
    await linkKbFile(
      targetFolderId
        ? { file_id: fileId, folder_id: targetFolderId }
        : { file_id: fileId }
    )
    await loadTree()
    await loadFilesForFolder(selectedFolderId.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    errorText.value = `${t('errorPrefix')}: ${message}`
  } finally {
    actionBusy.value = false
  }
}

const moveFolderToParent = async (folderId: string, targetParentId: string | null) => {
  if (folderId === targetParentId) {
    return
  }

  const descendants = collectDescendantFolderIds(folderId)
  if (targetParentId && descendants.has(targetParentId)) {
    errorText.value = `${t('errorPrefix')}: invalid folder move`
    return
  }

  actionBusy.value = true
  errorText.value = ''
  try {
    await moveKbFolder(folderId, targetParentId)
    await loadTree()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    errorText.value = `${t('errorPrefix')}: ${message}`
  } finally {
    actionBusy.value = false
  }
}

const onDragHandleStart = (type: 'folder' | 'file', id: string, event: DragEvent) => {
  if (!event.dataTransfer) {
    return
  }
  draggingItem.value = { type, id }
  event.dataTransfer.effectAllowed = 'move'
}

const onDragHandleEnd = () => {
  draggingItem.value = null
  dragOverFolderId.value = null
  dragOverRoot.value = false
}

const onFolderDragOver = (folderId: string, event: DragEvent) => {
  if (!draggingItem.value) {
    return
  }
  event.preventDefault()
  dragOverFolderId.value = folderId
}

const onFolderDragLeave = () => {
  dragOverFolderId.value = null
}

const onFolderDrop = async (folderId: string, event: DragEvent) => {
  event.preventDefault()
  dragOverFolderId.value = null
  const item = draggingItem.value
  if (!item) {
    return
  }
  if (item.type === 'file') {
    await moveFileToFolder(item.id, folderId)
  } else {
    await moveFolderToParent(item.id, folderId)
  }
}

const onRootDragOver = (event: DragEvent) => {
  if (!draggingItem.value) {
    return
  }
  event.preventDefault()
  dragOverRoot.value = true
}

const onRootDragLeave = () => {
  dragOverRoot.value = false
}

const onRootDrop = async (event: DragEvent) => {
  event.preventDefault()
  dragOverRoot.value = false
  const item = draggingItem.value
  if (!item) {
    return
  }
  if (item.type === 'file') {
    await moveFileToFolder(item.id, null)
  } else {
    await moveFolderToParent(item.id, null)
  }
}

const toggleFolderFilter = (folderId: string, checked: boolean) => {
  if (filterMode.value !== 'folders') {
    filterMode.value = 'folders'
    selectedFileFilterIds.value = []
  }

  if (checked) {
    if (!selectedFolderFilterIds.value.includes(folderId)) {
      selectedFolderFilterIds.value = [...selectedFolderFilterIds.value, folderId]
    }
  } else {
    selectedFolderFilterIds.value = selectedFolderFilterIds.value.filter((id) => id !== folderId)
    if (!selectedFolderFilterIds.value.length) {
      filterMode.value = 'none'
    }
  }
  emitFilters()
}

const toggleFileFilter = (fileId: string, checked: boolean) => {
  if (filterMode.value !== 'files') {
    filterMode.value = 'files'
    selectedFolderFilterIds.value = []
  }

  if (checked) {
    if (!selectedFileFilterIds.value.includes(fileId)) {
      selectedFileFilterIds.value = [...selectedFileFilterIds.value, fileId]
    }
  } else {
    selectedFileFilterIds.value = selectedFileFilterIds.value.filter((id) => id !== fileId)
    if (!selectedFileFilterIds.value.length) {
      filterMode.value = 'none'
    }
  }
  emitFilters()
}

const switchFilterMode = (mode: 'none' | 'folders' | 'files') => {
  filterMode.value = mode
  if (mode !== 'folders') {
    selectedFolderFilterIds.value = []
  }
  if (mode !== 'files') {
    selectedFileFilterIds.value = []
  }
  emitFilters()
}

const toggleFolderSelection = (folderId: string) => {
  const isSelected = selectedFolderFilterIds.value.includes(folderId)
  toggleFolderFilter(folderId, !isSelected)
}

const toggleFileSelection = (fileId: string) => {
  const isSelected = selectedFileFilterIds.value.includes(fileId)
  toggleFileFilter(fileId, !isSelected)
}

const handleFolderRowClick = (folderId: string) => {
  if (filterMode.value === 'folders') {
    toggleFolderSelection(folderId)
    return
  }
  openFolder(folderId)
}

const handleFileRowClick = (fileId: string) => {
  if (filterMode.value === 'files') {
    toggleFileSelection(fileId)
  }
}

watch(isAuthenticated, async (value) => {
  if (!value) {
    folders.value = []
    filesByFolder.value = { [ROOT_FOLDER_ID]: [] }
    selectedFolderId.value = ROOT_FOLDER_ID
    selectedFolderFilterIds.value = []
    selectedFileFilterIds.value = []
    filterMode.value = 'none'
    emitFilters()
    return
  }
  await loadTree()
})

watch(
  () => props.activeMode,
  (mode) => {
    if (mode && mode !== filterMode.value) {
      switchFilterMode(mode)
    }
  },
  { immediate: true }
)

const onWindowClick = () => {
  closeMenus()
}

onMounted(async () => {
  window.addEventListener('click', onWindowClick)
  if (isAuthenticated.value) {
    await loadTree()
  } else {
    emitFilters()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('click', onWindowClick)
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
          <BaseButton size="sm" variant="secondary" :disabled="!isAuthenticated || actionBusy || treeBusy" @click="handleCreateFolderClick">
            +
          </BaseButton>
          <BaseButton size="sm" variant="secondary" :disabled="!canGoUp || actionBusy || treeBusy" @click="goUp">
            &larr;
          </BaseButton>
        </div>
      </div>
      <div
        class="mt-2 rounded-md border px-2 py-1 text-xs transition"
        :class="dragOverRoot ? 'border-brand bg-brand-soft/70 text-brand-strong' : 'border-line bg-surface text-muted'"
        @dragover="onRootDragOver"
        @dragleave="onRootDragLeave"
        @drop="onRootDrop"
      >
        {{ t('kbRootFolder') }} · {{ t('dragToMove') }}
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
            class="flex items-center justify-between gap-2 rounded-lg border p-2 transition"
            :class="[
              selectedFolderFilterIds.includes(folder.id) ? 'border-brand/50 bg-brand-soft/70' : 'border-line bg-surface',
              dragOverFolderId === folder.id ? 'ring-2 ring-brand/40' : '',
            ]"
            @dragover="onFolderDragOver(folder.id, $event)"
            @dragleave="onFolderDragLeave"
            @drop="onFolderDrop(folder.id, $event)"
          >
            <button
              type="button"
              class="cursor-grab rounded px-1 text-muted active:cursor-grabbing"
              draggable="true"
              :title="t('dragToMove')"
              @dragstart="onDragHandleStart('folder', folder.id, $event)"
              @dragend="onDragHandleEnd"
            >
              ≡
            </button>
            <button
              class="min-w-0 flex-1 text-left text-sm text-foreground"
              :class="filterMode === 'folders' ? 'cursor-pointer' : ''"
              @click="handleFolderRowClick(folder.id)"
            >
              <span class="block truncate">{{ folder.name }}</span>
            </button>
            <div class="relative">
              <button
                type="button"
                class="ui-btn-secondary h-8 w-8 !px-0"
                :aria-label="t('moreActions')"
                @click.stop="toggleFolderMenu(folder.id)"
              >
                ⋯
              </button>
              <div
                v-if="openFolderMenuId === folder.id"
                class="absolute right-0 top-9 z-20 min-w-40 rounded-lg border border-line bg-surface p-1 shadow-card"
                @click.stop
              >
                <button
                  type="button"
                  class="w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface-muted"
                  @click="saveFolder(folder)"
                >
                  {{ t('saveFolder') }}
                </button>
                <button
                  type="button"
                  class="w-full rounded-md px-2 py-1.5 text-left text-sm text-danger transition hover:bg-danger-soft/70"
                  @click="deleteFolder(folder.id); closeMenus()"
                >
                  {{ t('delete') }}
                </button>
              </div>
            </div>
          </article>
        </div>

        <p v-else class="mt-2 text-sm text-muted">{{ t('kbNoSubfolders') }}</p>
      </div>
    </div>

    <div class="mt-3 rounded-xl border border-line bg-surface-muted/40 p-3">
      <div v-if="filesBusy" class="space-y-2">
        <BaseSkeleton :lines="2" />
      </div>

      <div v-else-if="selectedFolderFiles.length" class="max-h-[10rem] space-y-2 overflow-y-auto pr-1">
        <article
          v-for="file in selectedFolderFiles"
          :key="file.id"
          class="flex items-start gap-2 rounded-lg border p-2 transition"
          :class="selectedFileFilterIds.includes(file.id) ? 'border-brand/50 bg-brand-soft/70' : 'border-line bg-surface'"
          @click="handleFileRowClick(file.id)"
        >
          <button
            type="button"
            class="mt-0.5 cursor-grab rounded px-1 text-muted active:cursor-grabbing"
            draggable="true"
            :title="t('dragToMove')"
            @dragstart="onDragHandleStart('file', file.id, $event)"
            @dragend="onDragHandleEnd"
          >
            ≡
          </button>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-foreground">{{ file.name }}</p>
            <p class="text-xs text-muted">{{ parseFileSize(file.size) }} · {{ new Date(file.createdAt).toLocaleString() }}</p>
          </div>
          <div class="relative">
            <button
              type="button"
              class="ui-btn-secondary h-8 w-8 !px-0"
              :aria-label="t('moreActions')"
              @click.stop="toggleFileMenu(file.id)"
            >
              ⋯
            </button>
            <div
              v-if="openFileMenuId === file.id"
              class="absolute right-0 top-9 z-20 min-w-40 rounded-lg border border-line bg-surface p-1 shadow-card"
              @click.stop
            >
              <button
                type="button"
                class="w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface-muted"
                @click="saveFile(file)"
              >
                {{ t('saveFile') }}
              </button>
              <button
                type="button"
                class="w-full rounded-md px-2 py-1.5 text-left text-sm text-danger transition hover:bg-danger-soft/70"
                @click="removeFile(file.id); closeMenus()"
              >
                {{ t('delete') }}
              </button>
            </div>
          </div>
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

    <BaseAlert v-if="uploadBusy" tone="info" class="mt-3" role="status">
      {{ t('processing') }}
    </BaseAlert>

    <BaseAlert v-if="errorText" tone="danger" class="mt-3" role="alert">
      {{ errorText }}
    </BaseAlert>
  </BaseCard>
</template>
