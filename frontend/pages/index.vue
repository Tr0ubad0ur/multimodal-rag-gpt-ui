<script setup lang="ts">
import type { HistoryItem, QueryRequest, QueryResponse, RetrievedDoc, SourceModality, UsedSource } from '~/types/api'
import { formatRateAndQuotaError, parseApiError } from '~/composables/useApiError'

interface MessageSource {
  fileId: string
  modality: SourceModality
  score: number | null
  previewRef: string | null
  source: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: MessageSource[]
}

interface AskPayload {
  query: string
  top_k: number
  model: string
  attachment_id?: string
  attachment?: File
}

type RetryAction = 'ask' | 'history' | 'signin' | 'signup' | 'delete' | null

const {
  signIn,
  signUp,
  logout,
  askPublic,
  askAuth,
  uploadFile,
  getModels,
  getHistory,
  deleteHistory,
  me,
  refreshSession,
} = useApi()

const { user, session, isAuthenticated, hydrate, setAuth, clearAuth } = useAuth()
const { t } = useI18n()

const nextMessageId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`

const messages = ref<Message[]>([
  {
    id: nextMessageId(),
    role: 'assistant',
    content: t('welcomeMessage'),
  },
])
const history = ref<HistoryItem[]>([])
const selectedHistoryId = ref<number | null>(null)
const isAuthModalOpen = useState<boolean>('auth-modal-open', () => false)

const chatScrollEl = ref<HTMLElement | null>(null)
const chatBusy = ref(false)
const authBusy = ref(false)
const historyBusy = ref(false)
const attachmentUploadBusy = ref(false)
const errorText = ref('')
const retryAction = ref<RetryAction>(null)
const lastAskPayload = ref<AskPayload | null>(null)
const lastDeleteId = ref<number | null>(null)
const lastAuthPayload = ref<{ mode: 'signin' | 'signup'; payload: { email: string; password: string } } | null>(null)
const uploadedAttachment = ref<{ id: string; name: string; ingestJobId?: string | null; deduplicated?: boolean } | null>(null)
const attachmentUploadInfo = ref('')
const chatFilters = ref<{ mode: 'none' | 'folders' | 'files'; folderIds: string[]; fileIds: string[] }>({
  mode: 'none',
  folderIds: [],
  fileIds: [],
})
const availableModels = ref<{ value: string; label: string }[]>([])
const selectedFolderCount = computed(() => chatFilters.value.folderIds.length)
const selectedFileCount = computed(() => chatFilters.value.fileIds.length)

const userEmail = computed(() => user.value?.email ?? '')
const hasUserMessages = computed(() => messages.value.some((message) => message.role === 'user'))
const canRetry = computed(() => retryAction.value !== null)

const clearError = () => {
  errorText.value = ''
  retryAction.value = null
}

const scrollMessagesToBottom = async () => {
  await nextTick()
  if (chatScrollEl.value) {
    chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
  }
}

const normalizeUsedSource = (item: UsedSource): MessageSource | null => {
  const fileId = typeof item.file_id === 'string' && item.file_id.trim() ? item.file_id : ''
  const modality = item.modality === 'image' || item.modality === 'video' ? item.modality : 'text'
  const score = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null
  const previewRef = typeof item.preview_ref === 'string' && item.preview_ref.trim() ? item.preview_ref : null
  const source = typeof item.source === 'string' && item.source.trim() ? item.source : 'unknown'

  if (!fileId && !previewRef && source === 'unknown') {
    return null
  }

  return {
    fileId: fileId || 'n/a',
    modality,
    score,
    previewRef,
    source,
  }
}

const normalizeRetrievedDoc = (doc: RetrievedDoc, index: number): MessageSource => {
  const payload = doc.payload && typeof doc.payload === 'object' ? doc.payload : {}
  const fileIdCandidate = payload.file_id ?? payload.fileId ?? doc.id
  const sourceCandidate = payload.source ?? payload.filename ?? payload.title ?? doc.text ?? doc.content

  return {
    fileId:
      typeof fileIdCandidate === 'string'
        ? fileIdCandidate
        : typeof fileIdCandidate === 'number'
          ? String(fileIdCandidate)
          : `legacy-${index + 1}`,
    modality: 'text',
    score: typeof doc.score === 'number' && Number.isFinite(doc.score) ? doc.score : null,
    previewRef: null,
    source:
      typeof sourceCandidate === 'string' && sourceCandidate.trim()
        ? sourceCandidate
        : JSON.stringify(payload || doc),
  }
}

const normalizeSources = (payload: { used_sources?: UsedSource[] | null; retrieved_docs?: RetrievedDoc[] | null }): MessageSource[] | undefined => {
  if (Array.isArray(payload.used_sources) && payload.used_sources.length) {
    const normalized = payload.used_sources
      .map((item) => normalizeUsedSource(item))
      .filter((item): item is MessageSource => Boolean(item))

    if (normalized.length) {
      return normalized
    }
  }

  if (Array.isArray(payload.retrieved_docs) && payload.retrieved_docs.length) {
    return payload.retrieved_docs.map((doc, index) => normalizeRetrievedDoc(doc, index))
  }

  return undefined
}

const pushAssistantMessage = (response: QueryResponse) => {
  messages.value.push({
    id: nextMessageId(),
    role: 'assistant',
    content: response.answer || 'Ответ не получен.',
    sources: normalizeSources(response),
  })
}

const formatError = (prefix: string, error: unknown): string =>
  formatRateAndQuotaError(parseApiError(error), prefix)

const loadHistory = async () => {
  if (!isAuthenticated.value) {
    history.value = []
    return
  }

  historyBusy.value = true
  try {
    const result = await getHistory()
    history.value = result.data ?? []
  } catch (error) {
    errorText.value = formatError(t('historyError'), error)
    retryAction.value = 'history'
  } finally {
    historyBusy.value = false
  }
}

const handleAsk = async (payload: AskPayload) => {
  chatBusy.value = true
  clearError()
  lastAskPayload.value = payload

  messages.value.push({
    id: nextMessageId(),
    role: 'user',
    content: payload.query,
  })
  await scrollMessagesToBottom()

  try {
    const topK = Math.min(50, Math.max(1, Number(payload.top_k) || 8))
    const requestPayload: QueryRequest = {
      query: payload.query,
      top_k: topK,
      model: payload.model,
    }

    if (payload.attachment instanceof File) {
      requestPayload.attachment = payload.attachment
    }
    if (payload.attachment_id) {
      requestPayload.attachment_id = payload.attachment_id
    }

    if (isAuthenticated.value) {
      if (chatFilters.value.mode === 'files' && chatFilters.value.fileIds.length) {
        requestPayload.file_ids = chatFilters.value.fileIds
      } else if (chatFilters.value.mode === 'folders' && chatFilters.value.folderIds.length) {
        requestPayload.folder_ids = chatFilters.value.folderIds
      }
    }

    const response = isAuthenticated.value
      ? await askAuth(requestPayload)
      : await askPublic(requestPayload)

    pushAssistantMessage(response)
    await scrollMessagesToBottom()

    if (isAuthenticated.value) {
      await loadHistory()
    }
  } catch (error) {
    errorText.value = formatError(t('errorPrefix'), error)
    retryAction.value = 'ask'
    messages.value.push({
      id: nextMessageId(),
      role: 'assistant',
      content: errorText.value,
    })
    await scrollMessagesToBottom()
  } finally {
    chatBusy.value = false
  }
}

const handleSignIn = async (payload: { email: string; password: string }) => {
  authBusy.value = true
  clearError()
  lastAuthPayload.value = { mode: 'signin', payload }
  try {
    const result = await signIn(payload)
    if (!result.session || !result.user) {
      throw new Error('No session returned by backend')
    }

    setAuth(result.session, result.user)
    await loadModels()
    await loadHistory()
    isAuthModalOpen.value = false
  } catch (error) {
    errorText.value = formatError(t('signInError'), error)
    retryAction.value = 'signin'
  } finally {
    authBusy.value = false
  }
}

const handleSignUp = async (payload: { email: string; password: string }) => {
  authBusy.value = true
  clearError()
  lastAuthPayload.value = { mode: 'signup', payload }
  try {
    const result = await signUp(payload)
    if (result.session && result.user) {
      setAuth(result.session, result.user)
      await loadModels()
      await loadHistory()
      isAuthModalOpen.value = false
      return
    }

    errorText.value = t('signUpDone')
    retryAction.value = null
  } catch (error) {
    errorText.value = formatError(t('signUpError'), error)
    retryAction.value = 'signup'
  } finally {
    authBusy.value = false
  }
}

const handleLogout = async () => {
  authBusy.value = true
  clearError()
  try {
    if (isAuthenticated.value) {
      await logout()
    }
  } catch {
    // Ignore logout errors and clear local session anyway.
  } finally {
    clearAuth()
    history.value = []
    availableModels.value = []
    uploadedAttachment.value = null
    chatFilters.value = { mode: 'none', folderIds: [], fileIds: [] }
    authBusy.value = false
  }
}

const handleAttachmentUpload = async (file: File) => {
  if (!isAuthenticated.value) {
    errorText.value = `${t('errorPrefix')}: Необходимо войти, чтобы загрузить файл через скрепку.`
    retryAction.value = null
    return
  }

  attachmentUploadBusy.value = true
  clearError()
  attachmentUploadInfo.value = ''
  try {
    const uploaded = await uploadFile(file)
    uploadedAttachment.value = {
      id: uploaded.file_id,
      name: uploaded.filename,
      ingestJobId: uploaded.ingest_job_id ?? null,
      deduplicated: Boolean(uploaded.deduplicated),
    }
    if (uploaded.deduplicated) {
      attachmentUploadInfo.value = t('uploadDeduplicated')
    } else if (uploaded.ingest_job_id) {
      attachmentUploadInfo.value = `${t('uploadIngestJob')}: ${uploaded.ingest_job_id}`
    } else {
      attachmentUploadInfo.value = ''
    }
  } catch (error) {
    errorText.value = formatError(t('errorPrefix'), error)
    retryAction.value = null
  } finally {
    attachmentUploadBusy.value = false
  }
}

const clearUploadedAttachment = () => {
  uploadedAttachment.value = null
  attachmentUploadInfo.value = ''
}

const handleKbFiltersChange = (payload: { mode: 'none' | 'folders' | 'files'; folderIds: string[]; fileIds: string[] }) => {
  if (chatFilters.value.mode !== payload.mode) {
    // Switching retrieval mode resets attachment-id based retrieval to avoid mixed filters.
    uploadedAttachment.value = null
    attachmentUploadInfo.value = ''
  }
  chatFilters.value = payload
}

const setChatFilterMode = (mode: 'none' | 'folders' | 'files') => {
  if (chatFilters.value.mode === mode) {
    return
  }
  uploadedAttachment.value = null
  attachmentUploadInfo.value = ''
  chatFilters.value = { mode, folderIds: [], fileIds: [] }
}

const loadModels = async () => {
  try {
    const payload = await getModels()
    const listCandidate = Array.isArray(payload.models)
      ? payload.models
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.items)
          ? payload.items
          : []

    const normalized = listCandidate
      .map((item) => {
        if (typeof item === 'string') {
          return { value: item, label: item }
        }
        if (item && typeof item === 'object') {
          const source = item as Record<string, unknown>
          const value = source.value ?? source.id ?? source.name ?? source.model
          const label = source.label ?? source.name ?? source.title ?? value
          if (typeof value === 'string' && typeof label === 'string') {
            return { value, label }
          }
        }
        return null
      })
      .filter((item): item is { value: string; label: string } => Boolean(item))

    availableModels.value = normalized
  } catch {
    availableModels.value = []
  }
}

watch(isAuthenticated, async (value) => {
  if (value) {
    await loadModels()
    return
  }
  availableModels.value = []
})

const handleDeleteHistory = async (id: number) => {
  historyBusy.value = true
  clearError()
  lastDeleteId.value = id
  try {
    await deleteHistory(id)
    history.value = history.value.filter((item) => item.id !== id)
    if (selectedHistoryId.value === id) {
      selectedHistoryId.value = null
    }
  } catch (error) {
    errorText.value = formatError(t('deleteError'), error)
    retryAction.value = 'delete'
  } finally {
    historyBusy.value = false
  }
}

const selectHistory = (item: HistoryItem) => {
  selectedHistoryId.value = item.id
  messages.value.push(
    {
      id: nextMessageId(),
      role: 'user',
      content: item.query,
    },
    {
      id: nextMessageId(),
      role: 'assistant',
      content: item.answer,
      sources: normalizeSources(item),
    }
  )
  void scrollMessagesToBottom()
}

const retryLastAction = async () => {
  switch (retryAction.value) {
    case 'ask':
      if (lastAskPayload.value) {
        await handleAsk(lastAskPayload.value)
      }
      break
    case 'history':
      await loadHistory()
      break
    case 'signin':
      if (lastAuthPayload.value?.mode === 'signin') {
        await handleSignIn(lastAuthPayload.value.payload)
      }
      break
    case 'signup':
      if (lastAuthPayload.value?.mode === 'signup') {
        await handleSignUp(lastAuthPayload.value.payload)
      }
      break
    case 'delete':
      if (typeof lastDeleteId.value === 'number') {
        await handleDeleteHistory(lastDeleteId.value)
      }
      break
    default:
      break
  }
}

const closeAuthModal = () => {
  isAuthModalOpen.value = false
}

const onAuthOverlayClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    closeAuthModal()
  }
}

const onEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isAuthModalOpen.value) {
    closeAuthModal()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onEscape)
  hydrate()
  await loadModels()

  if (!session.value) {
    return
  }

  try {
    if (session.value.expires_at && Date.now() / 1000 > Number(session.value.expires_at) - 20) {
      const refreshed = await refreshSession(session.value.refresh_token)
      if (refreshed.session && refreshed.user) {
        setAuth(refreshed.session, refreshed.user)
      }
    }

    const currentUser = await me()
    setAuth(session.value, currentUser)
    await loadHistory()
  } catch {
    clearAuth()
    history.value = []
  }

  await scrollMessagesToBottom()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <div class="grid min-h-[calc(100vh-8rem)] gap-6 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
    <aside class="order-2 lg:order-1 lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-6rem)]">
      <HistoryPanel
        class="w-full"
        :items="history"
        :loading="historyBusy"
        :active-id="selectedHistoryId"
        @refresh="loadHistory"
        @select="selectHistory"
        @remove="handleDeleteHistory"
      />
    </aside>

    <section class="order-1 min-w-0 lg:order-2">
      <div class="space-y-4">
        <BaseCard :padded="false" class="overflow-hidden">
          <div class="border-b border-line bg-surface-muted/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {{ t('chatTitle') }}
          </div>
          <div ref="chatScrollEl" class="max-h-[58vh] space-y-3 overflow-y-auto p-4">

            <ChatMessage
              v-for="message in messages"
              :key="message.id"
              :role="message.role"
              :content="message.content"
              :sources="message.sources"
            />

            <article v-if="chatBusy" class="mr-auto max-w-4xl rounded-2xl border border-line bg-surface p-4 shadow-sm ui-pulse">
              <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{{ t('assistant') }}</p>
              <BaseSkeleton :lines="2" />
            </article>
          </div>
        </BaseCard>

        <div>
          <ChatComposer
            :busy="chatBusy"
            :uploading-attachment="attachmentUploadBusy"
            :uploaded-attachment-id="uploadedAttachment?.id"
            :uploaded-attachment-name="uploadedAttachment?.name"
            :model-options="availableModels"
            :filter-mode="chatFilters.mode"
            :filter-controls-disabled="!isAuthenticated"
            :selected-folder-count="selectedFolderCount"
            :selected-file-count="selectedFileCount"
            @send="handleAsk"
            @upload-attachment="handleAttachmentUpload"
            @clear-uploaded-attachment="clearUploadedAttachment"
            @filter-mode-change="setChatFilterMode"
          />
        </div>

        <BaseAlert v-if="attachmentUploadInfo" tone="info" role="status">
          {{ attachmentUploadInfo }}
        </BaseAlert>

        <BaseAlert v-if="errorText" tone="danger" role="alert" aria-live="polite">
          <div class="flex items-start justify-between gap-3">
            <p class="leading-relaxed">{{ errorText }}</p>
            <BaseButton
              v-if="canRetry"
              variant="danger"
              size="sm"
              @click="retryLastAction"
            >
              {{ t('retry') }}
            </BaseButton>
          </div>
        </BaseAlert>
      </div>
    </section>

    <aside class="order-3 lg:sticky lg:top-6 lg:self-start">
      <div class="space-y-4">
        <KnowledgeBasePanel :active-mode="chatFilters.mode" @filters-change="handleKbFiltersChange" />
        <IngestAdminPanel />
      </div>
    </aside>
  </div>

  <div
    v-if="isAuthModalOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
    @click="onAuthOverlayClick"
  >
    <div class="w-full max-w-md">
      <AuthPanel
        :busy="authBusy"
        :authenticated="isAuthenticated"
        :user-email="userEmail"
        @signin="handleSignIn"
        @signup="handleSignUp"
        @logout="handleLogout"
      />
      <BaseButton block class="mt-3" variant="secondary" @click="closeAuthModal">
        {{ t('close') }}
      </BaseButton>
    </div>
  </div>
</template>
