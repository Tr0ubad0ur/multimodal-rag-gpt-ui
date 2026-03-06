<script setup lang="ts">
import type { FileProcessingStatus } from '~/types/api'
import { formatRateAndQuotaError, parseApiError } from '~/composables/useApiError'

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

interface DroppedFile {
  file: File
  relativePath: string
}

interface MenuPosition {
  top: number
  left: number
}

interface FileProcessingState {
  status: FileProcessingStatus
  latestJobId: string | null
  latestError: string | null
  latestFailedJobId: string | null
}

const ROOT_FOLDER_ID = 'root'

const { t } = useI18n()
const config = useRuntimeConfig()
const { isAuthenticated, accessToken } = useAuth()
const {
  getKbTree,
  createKbFolder,
  deleteKbFolder,
  getKbFiles,
  linkKbFile,
  deleteKbFile,
  uploadFile,
  uploadFolderFiles,
  getFileProcessing,
  reindexFile,
  retryIngestJob,
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
const createFolderControlsRef = ref<HTMLElement | null>(null)
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
const folderMenuPosition = ref<MenuPosition | null>(null)
const fileMenuPosition = ref<MenuPosition | null>(null)
const draggingFileId = ref<string | null>(null)
const dragOverFolderId = ref<string | null>(null)
const dragOverRoot = ref(false)
const uploadInfoText = ref('')
const processingByFileId = ref<Record<string, FileProcessingState>>({})
const processingBusy = ref(false)
let processingPollTimer: ReturnType<typeof setInterval> | null = null

const getEntryFromItem = (item: DataTransferItem): FileSystemEntry | null => {
  return (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.() ?? null
}

const readDroppedEntry = async (entry: FileSystemEntry, parentPath = ''): Promise<DroppedFile[]> => {
  const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name

  if (entry.isFile) {
    return await new Promise<DroppedFile[]>((resolve) => {
      ;(entry as FileSystemFileEntry).file(
        (file) => resolve([{ file, relativePath: currentPath }]),
        () => resolve([])
      )
    })
  }

  if (!entry.isDirectory) {
    return []
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const children: FileSystemEntry[] = []

  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]))
    })
    if (!batch.length) {
      break
    }
    children.push(...batch)
  }

  const nestedFiles = await Promise.all(children.map((child) => readDroppedEntry(child, currentPath)))
  return nestedFiles.flat()
}

const extractDroppedFiles = async (dataTransfer: DataTransfer | null): Promise<DroppedFile[]> => {
  if (!dataTransfer) {
    return []
  }

  if (dataTransfer.items?.length) {
    const fromEntries = await Promise.all(
      Array.from(dataTransfer.items)
        .filter((item) => item.kind === 'file')
        .map(async (item) => {
          const entry = getEntryFromItem(item)
          if (entry) {
            return await readDroppedEntry(entry)
          }
          const file = item.getAsFile()
          return file ? [{ file, relativePath: file.webkitRelativePath || file.name }] : []
        })
    )
    const files = fromEntries.flat()
    if (files.length) {
      return files
    }
  }

  return Array.from(dataTransfer.files ?? []).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }))
}

const getFileExtension = (path: string): string => {
  const normalized = path.replaceAll('\\', '/')
  const filename = normalized.split('/').pop() ?? ''
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return 'unknown'
  }
  return filename.slice(dotIndex + 1).toLowerCase()
}

const shouldSkipUnsupportedFile = (item: DroppedFile): boolean => {
  const relativePath = (item.relativePath || item.file.name).replaceAll('\\', '/')
  const filename = (relativePath.split('/').pop() ?? item.file.name).toLowerCase()
  const mime = (item.file.type || '').toLowerCase()
  const ext = getFileExtension(relativePath)

  if (filename === '.ds_store' || filename === 'thumbs.db') {
    return true
  }
  if (filename.startsWith('._')) {
    return true
  }
  if (ext === 'unknown') {
    return true
  }
  if (!mime || mime === 'application/octet-stream') {
    return false
  }
  return false
}

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

const openFolderMenuItem = computed(() => {
  if (!openFolderMenuId.value) {
    return null
  }
  return childFolders.value.find((folder) => folder.id === openFolderMenuId.value) ?? null
})

const openFileMenuItem = computed(() => {
  if (!openFileMenuId.value) {
    return null
  }
  return selectedFolderFiles.value.find((file) => file.id === openFileMenuId.value) ?? null
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

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const downloadText = (filename: string, content: string) => {
  downloadBlob(filename, new Blob([content], { type: 'text/plain;charset=utf-8' }))
}

const downloadFile = async (fileId: string, token: string) => {
  const response = await fetch(`${config.public.apiBase}/files/${fileId}/download`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (!response.ok || contentType.includes('application/json')) {
    let message = `Download failed: ${response.status}`
    try {
      const payload = (await response.json()) as { detail?: string }
      if (typeof payload?.detail === 'string' && payload.detail.trim()) {
        message = payload.detail
      }
    } catch {}
    throw new Error(message)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  a.click()
  URL.revokeObjectURL(url)
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

const formatError = (error: unknown): string => formatRateAndQuotaError(parseApiError(error), t('errorPrefix'))

const getProcessingLabel = (status: FileProcessingStatus): string => {
  switch (status) {
    case 'queued':
      return t('processingQueued')
    case 'processing':
      return t('processingInProgress')
    case 'completed':
      return t('processingCompleted')
    case 'failed':
      return t('processingFailed')
    case 'not_indexed':
      return t('processingNotIndexed')
    default:
      return status
  }
}

const getProcessingClass = (status: FileProcessingStatus): string => {
  switch (status) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'failed':
      return 'border-danger/40 bg-danger-soft text-danger'
    case 'queued':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'processing':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'not_indexed':
      return 'border-line bg-surface text-muted'
    default:
      return 'border-line bg-surface text-muted'
  }
}

const defaultProcessingState = (): FileProcessingState => ({
  status: 'not_indexed',
  latestJobId: null,
  latestError: null,
  latestFailedJobId: null,
})

const getFileProcessingState = (fileId: string): FileProcessingState => {
  return processingByFileId.value[fileId] ?? defaultProcessingState()
}

const refreshFileProcessing = async (fileId: string) => {
  const payload = await getFileProcessing(fileId)
  const latest = Array.isArray(payload.jobs) ? payload.jobs[0] : null
  const failed = Array.isArray(payload.jobs) ? payload.jobs.find((job) => job.status === 'failed') : null
  processingByFileId.value[fileId] = {
    status: payload.status ?? 'not_indexed',
    latestJobId: latest?.id ?? null,
    latestError: typeof latest?.error === 'string' ? latest.error : null,
    latestFailedJobId: failed?.id ?? null,
  }
}

const refreshVisibleFileProcessing = async () => {
  if (!isAuthenticated.value || !selectedFolderFiles.value.length) {
    processingByFileId.value = {}
    return
  }

  processingBusy.value = true
  try {
    await Promise.all(selectedFolderFiles.value.map((file) => refreshFileProcessing(file.id)))
  } catch (error) {
    errorText.value = formatError(error)
  } finally {
    processingBusy.value = false
  }
}

const hasRunningProcessing = computed(() =>
  selectedFolderFiles.value.some((file) => {
    const state = getFileProcessingState(file.id)
    return state.status === 'queued' || state.status === 'processing'
  })
)

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
    await refreshVisibleFileProcessing()
    pruneFilters()
    emitFilters()
  } catch (error) {
    errorText.value = formatError(error)
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
    errorText.value = formatError(error)
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
    errorText.value = formatError(error)
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
    errorText.value = formatError(error)
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
  uploadInfoText.value = ''
  try {
    const folderId = selectedFolderId.value === ROOT_FOLDER_ID ? null : selectedFolderId.value
    const uploadNotes: string[] = []
    for (const file of Array.from(incomingFiles)) {
      const uploaded = await uploadFile(file)
      if (uploaded.deduplicated) {
        uploadNotes.push(`${uploaded.filename}: ${t('uploadDeduplicated')}`)
      } else if (uploaded.ingest_job_id) {
        uploadNotes.push(`${uploaded.filename}: ${t('uploadIngestJob')} ${uploaded.ingest_job_id}`)
      }
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
    uploadInfoText.value = uploadNotes.join(' | ')
  } catch (error) {
    errorText.value = formatError(error)
  } finally {
    uploadBusy.value = false
  }
}

const uploadFolderStructure = async (droppedFiles: DroppedFile[]) => {
  if (!isAuthenticated.value || !droppedFiles.length) {
    return
  }

  const formData = new FormData()
  for (const item of droppedFiles) {
    const normalizedPath = item.relativePath.replaceAll('\\', '/').replace(/^\/+/, '') || item.file.name
    formData.append('files', item.file, item.file.name)
    formData.append('relative_paths', normalizedPath)
  }

  if (selectedFolderId.value !== ROOT_FOLDER_ID) {
    formData.append('parent_id', selectedFolderId.value)
  }

  return await uploadFolderFiles(formData)
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
  void (async () => {
    const rawDroppedFiles = await extractDroppedFiles(event.dataTransfer)
    if (!rawDroppedFiles.length) {
      return
    }

    for (const item of rawDroppedFiles) {
      console.info('[kb-upload] item', { name: item.file.name, relativePath: item.relativePath })
    }

    const droppedFiles = rawDroppedFiles.filter((item) => {
      const shouldSkip = shouldSkipUnsupportedFile(item)
      if (shouldSkip) {
        console.info('[kb-upload] skipped', { name: item.file.name, relativePath: item.relativePath })
      }
      return !shouldSkip
    })
    if (!droppedFiles.length) {
      errorText.value = `${t('errorPrefix')}: no supported files to upload`
      return
    }

    if (droppedFiles.length !== rawDroppedFiles.length) {
      const skipped = rawDroppedFiles.length - droppedFiles.length
      errorText.value = `${t('errorPrefix')}: skipped ${skipped} unsupported file(s)`
    }

    const hasNestedPaths = droppedFiles.some((item) => item.relativePath.includes('/'))
    if (!hasNestedPaths) {
      const dataTransfer = new DataTransfer()
      for (const item of droppedFiles) {
        dataTransfer.items.add(item.file)
      }
      await addFilesToSelectedFolder(dataTransfer.files)
      return
    }

    uploadBusy.value = true
    errorText.value = ''
    uploadInfoText.value = ''
    try {
      const result = await uploadFolderStructure(droppedFiles)
      const dedupCount = (result.uploaded ?? []).filter((item) => item.deduplicated).length
      const jobIds = (result.uploaded ?? [])
        .map((item) => item.ingest_job_id)
        .filter((item): item is string => typeof item === 'string' && item.length > 0)
      if (dedupCount > 0 || jobIds.length > 0) {
        const parts: string[] = []
        if (jobIds.length > 0) {
          parts.push(`${t('uploadIngestJobsCount')}: ${jobIds.length}`)
        }
        if (dedupCount > 0) {
          parts.push(`${t('uploadDeduplicatedCount')}: ${dedupCount}`)
        }
        uploadInfoText.value = parts.join(' · ')
      }
      await loadTree()
      await loadFilesForFolder(selectedFolderId.value)
    } catch (error) {
      errorText.value = formatError(error)
    } finally {
      uploadBusy.value = false
    }
  })()
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
    errorText.value = formatError(error)
  } finally {
    actionBusy.value = false
  }
}

const reindexKbFile = async (fileId: string) => {
  if (!isAuthenticated.value) {
    return
  }

  actionBusy.value = true
  errorText.value = ''
  try {
    await reindexFile(fileId)
    uploadInfoText.value = t('reindexScheduled')
    await refreshFileProcessing(fileId)
  } catch (error) {
    errorText.value = formatError(error)
  } finally {
    actionBusy.value = false
  }
}

const retryFailedJob = async (fileId: string) => {
  if (!isAuthenticated.value) {
    return
  }

  const state = getFileProcessingState(fileId)
  if (!state.latestFailedJobId) {
    return
  }

  actionBusy.value = true
  errorText.value = ''
  try {
    await retryIngestJob(state.latestFailedJobId)
    uploadInfoText.value = t('retryScheduled')
    await refreshFileProcessing(fileId)
  } catch (error) {
    errorText.value = formatError(error)
  } finally {
    actionBusy.value = false
  }
}

const saveFile = async (file: KnowledgeFile) => {
  if (!isAuthenticated.value) {
    return
  }

  actionBusy.value = true
  errorText.value = ''
  try {
    if (!accessToken.value) {
      throw new Error('No access token')
    }
    await downloadFile(file.id, accessToken.value)
    openFileMenuId.value = null
  } catch (error) {
    errorText.value = formatError(error)
  } finally {
    actionBusy.value = false
  }
}

const resolveMenuPosition = (target: EventTarget | null): MenuPosition | null => {
  const anchor = target instanceof HTMLElement ? target : null
  if (!anchor) {
    return null
  }
  const rect = anchor.getBoundingClientRect()
  const estimatedMenuWidth = 176
  const estimatedMenuHeight = 108
  const spacing = 8

  const left = Math.max(
    spacing,
    Math.min(rect.right - estimatedMenuWidth, window.innerWidth - estimatedMenuWidth - spacing)
  )
  const canOpenDown = rect.bottom + spacing + estimatedMenuHeight <= window.innerHeight - spacing
  const top = canOpenDown
    ? rect.bottom + spacing
    : Math.max(spacing, rect.top - estimatedMenuHeight - spacing)

  return { top, left }
}

const toggleFolderMenu = (folderId: string, event?: MouseEvent) => {
  openFileMenuId.value = null
  fileMenuPosition.value = null
  if (openFolderMenuId.value === folderId) {
    openFolderMenuId.value = null
    folderMenuPosition.value = null
    return
  }
  openFolderMenuId.value = folderId
  folderMenuPosition.value = resolveMenuPosition(event?.currentTarget ?? null)
}

const toggleFileMenu = (fileId: string, event?: MouseEvent) => {
  openFolderMenuId.value = null
  folderMenuPosition.value = null
  if (openFileMenuId.value === fileId) {
    openFileMenuId.value = null
    fileMenuPosition.value = null
    return
  }
  openFileMenuId.value = fileId
  fileMenuPosition.value = resolveMenuPosition(event?.currentTarget ?? null)
}

const closeMenus = () => {
  openFolderMenuId.value = null
  openFileMenuId.value = null
  folderMenuPosition.value = null
  fileMenuPosition.value = null
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
    errorText.value = formatError(error)
  } finally {
    actionBusy.value = false
  }
}

const onDragHandleStart = (id: string, event: DragEvent) => {
  if (!event.dataTransfer) {
    return
  }
  draggingFileId.value = id
  event.dataTransfer.effectAllowed = 'move'
}

const onDragHandleEnd = () => {
  draggingFileId.value = null
  dragOverFolderId.value = null
  dragOverRoot.value = false
}

const onFolderDragOver = (folderId: string, event: DragEvent) => {
  if (!draggingFileId.value) {
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
  const fileId = draggingFileId.value
  if (!fileId) {
    return
  }
  await moveFileToFolder(fileId, folderId)
}

const onRootDragOver = (event: DragEvent) => {
  if (!draggingFileId.value) {
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
  const fileId = draggingFileId.value
  if (!fileId) {
    return
  }
  await moveFileToFolder(fileId, null)
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

const stopProcessingPolling = () => {
  if (processingPollTimer) {
    clearInterval(processingPollTimer)
    processingPollTimer = null
  }
}

const startProcessingPolling = () => {
  stopProcessingPolling()
  processingPollTimer = setInterval(() => {
    if (!isAuthenticated.value || !hasRunningProcessing.value) {
      return
    }
    void refreshVisibleFileProcessing()
  }, 8000)
}

watch(isAuthenticated, async (value) => {
  if (!value) {
    folders.value = []
    filesByFolder.value = { [ROOT_FOLDER_ID]: [] }
    processingByFileId.value = {}
    uploadInfoText.value = ''
    selectedFolderId.value = ROOT_FOLDER_ID
    selectedFolderFilterIds.value = []
    selectedFileFilterIds.value = []
    filterMode.value = 'none'
    stopProcessingPolling()
    emitFilters()
    return
  }
  startProcessingPolling()
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

watch(
  () => selectedFolderId.value,
  () => {
    if (!isAuthenticated.value) {
      return
    }
    void refreshVisibleFileProcessing()
  }
)

const onWindowClick = (event: MouseEvent) => {
  if (showCreateFolderInput.value && !folderName.value.trim()) {
    const target = event.target as Node | null
    if (target && createFolderControlsRef.value && !createFolderControlsRef.value.contains(target)) {
      showCreateFolderInput.value = false
      errorText.value = ''
    }
  }
  closeMenus()
}

onMounted(async () => {
  window.addEventListener('click', onWindowClick)
  if (isAuthenticated.value) {
    startProcessingPolling()
    await loadTree()
  } else {
    emitFilters()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('click', onWindowClick)
  stopProcessingPolling()
})
</script>

<template>
  <BaseCard>
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('kbTitle') }}</h2>
    </div>

    <div class="mt-3 rounded-xl border border-line bg-surface-muted/40 p-3">
      <div ref="createFolderControlsRef">
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
      
        <div v-if="showCreateFolderInput" class="mt-2">
          <BaseInput
            v-model="folderName"
            :placeholder="t('kbFolderPlaceholder')"
            @keydown.enter.prevent="createFolder"
          />
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

      <div class="mt-3">
        <div v-if="childFolders.length" class="max-h-[11rem] space-y-2 overflow-y-auto pb-16 pr-1">
          <article
            v-for="folder in childFolders"
            :key="folder.id"
            class="relative flex items-center justify-between gap-2 rounded-lg border p-2 transition"
            :class="[
              selectedFolderFilterIds.includes(folder.id) ? 'border-brand/50 bg-brand-soft/70' : 'border-line bg-surface',
              dragOverFolderId === folder.id ? 'ring-2 ring-brand/40' : '',
              openFolderMenuId === folder.id ? 'z-30' : 'z-0',
            ]"
            @dragover="onFolderDragOver(folder.id, $event)"
            @dragleave="onFolderDragLeave"
            @drop="onFolderDrop(folder.id, $event)"
          >
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
                @click.stop="toggleFolderMenu(folder.id, $event)"
              >
                ⋯
              </button>
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

      <div v-else-if="selectedFolderFiles.length" class="max-h-[10rem] space-y-2 overflow-y-auto pb-16 pr-1">
        <article
          v-for="file in selectedFolderFiles"
          :key="file.id"
          class="relative flex items-start gap-2 rounded-lg border p-2 transition"
          :class="[
            selectedFileFilterIds.includes(file.id) ? 'border-brand/50 bg-brand-soft/70' : 'border-line bg-surface',
            openFileMenuId === file.id ? 'z-30' : 'z-0',
          ]"
          @click="handleFileRowClick(file.id)"
        >
          <button
            type="button"
            class="mt-0.5 cursor-grab rounded px-1 text-muted active:cursor-grabbing"
            draggable="true"
            :title="t('dragToMove')"
            @dragstart="onDragHandleStart(file.id, $event)"
            @dragend="onDragHandleEnd"
          >
            ≡
          </button>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-foreground">{{ file.name }}</p>
            <p class="text-xs text-muted">{{ parseFileSize(file.size) }} · {{ new Date(file.createdAt).toLocaleString() }}</p>
            <div class="mt-1 flex items-center gap-2">
              <span
                class="inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
                :class="getProcessingClass(getFileProcessingState(file.id).status)"
              >
                {{ getProcessingLabel(getFileProcessingState(file.id).status) }}
              </span>
              <span v-if="getFileProcessingState(file.id).latestJobId" class="text-[11px] text-muted">
                job: {{ getFileProcessingState(file.id).latestJobId }}
              </span>
            </div>
            <p
              v-if="getFileProcessingState(file.id).status === 'failed' && getFileProcessingState(file.id).latestError"
              class="mt-1 line-clamp-2 text-[11px] text-danger"
            >
              {{ getFileProcessingState(file.id).latestError }}
            </p>
          </div>
          <div class="relative">
            <button
              type="button"
              class="ui-btn-secondary h-8 w-8 !px-0"
              :aria-label="t('moreActions')"
              @click.stop="toggleFileMenu(file.id, $event)"
            >
              ⋯
            </button>
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

    <BaseAlert v-if="processingBusy" tone="info" class="mt-3" role="status">
      {{ t('processingStatusesUpdating') }}
    </BaseAlert>

    <BaseAlert v-if="uploadInfoText" tone="info" class="mt-3" role="status">
      {{ uploadInfoText }}
    </BaseAlert>

    <BaseAlert v-if="errorText" tone="danger" class="mt-3" role="alert">
      {{ errorText }}
    </BaseAlert>

    <Teleport to="body">
      <div
        v-if="openFolderMenuItem && folderMenuPosition"
        class="fixed z-[120] min-w-40 rounded-lg border border-line bg-surface p-1 shadow-card"
        :style="{ top: `${folderMenuPosition.top}px`, left: `${folderMenuPosition.left}px` }"
        @click.stop
      >
        <button
          type="button"
          class="w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface-muted"
          @click="saveFolder(openFolderMenuItem)"
        >
          {{ t('saveFolder') }}
        </button>
        <button
          type="button"
          class="w-full rounded-md px-2 py-1.5 text-left text-sm text-danger transition hover:bg-danger-soft/70"
          @click="deleteFolder(openFolderMenuItem.id); closeMenus()"
        >
          {{ t('delete') }}
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="openFileMenuItem && fileMenuPosition"
        class="fixed z-[120] min-w-40 rounded-lg border border-line bg-surface p-1 shadow-card"
        :style="{ top: `${fileMenuPosition.top}px`, left: `${fileMenuPosition.left}px` }"
        @click.stop
      >
        <button
          type="button"
          class="w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface-muted"
          @click="saveFile(openFileMenuItem)"
        >
          {{ t('saveFile') }}
        </button>
        <button
          type="button"
          class="w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface-muted"
          @click="reindexKbFile(openFileMenuItem.id); closeMenus()"
        >
          {{ t('reindexFile') }}
        </button>
        <button
          v-if="getFileProcessingState(openFileMenuItem.id).status === 'failed' && getFileProcessingState(openFileMenuItem.id).latestFailedJobId"
          type="button"
          class="w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface-muted"
          @click="retryFailedJob(openFileMenuItem.id); closeMenus()"
        >
          {{ t('retryFailedJob') }}
        </button>
        <button
          type="button"
          class="w-full rounded-md px-2 py-1.5 text-left text-sm text-danger transition hover:bg-danger-soft/70"
          @click="removeFile(openFileMenuItem.id); closeMenus()"
        >
          {{ t('delete') }}
        </button>
      </div>
    </Teleport>
  </BaseCard>
</template>
