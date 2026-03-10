import type {
  AuthResponse,
  AuthUser,
  EmbeddingResponse,
  FileProcessingResponse,
  FileUploadResponse,
  FolderUploadResponse,
  HistoryResponse,
  IngestDlqItem,
  IngestJob,
  IngestJobResponse,
  IngestJobStatus,
  ImageEmbeddingRequest,
  KbFile,
  KbFolder,
  QueryRequest,
  QueryResponse,
  TextEmbeddingRequest,
  VideoEmbeddingRequest,
} from '~/types/api'

interface Credentials {
  email: string
  password: string
}

let refreshPromise: Promise<void> | null = null

export const useApi = () => {
  const config = useRuntimeConfig()
  const { session, user, accessToken, setAuth, clearAuth } = useAuth()

  const refreshAccessToken = async () => {
    const refreshToken = session.value?.refresh_token
    if (!refreshToken) {
      throw new Error('No refresh token')
    }

    const response = await $fetch<{ session?: { access_token?: string; refresh_token?: string } }>('/auth/refresh', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: { refresh_token: refreshToken },
    })

    const nextAccessToken = response?.session?.access_token
    const nextRefreshToken = response?.session?.refresh_token

    if (!nextAccessToken || !nextRefreshToken) {
      throw new Error('Refresh failed: no tokens in response')
    }

    setAuth(
      {
        ...(session.value ?? {}),
        ...(response.session ?? {}),
        access_token: nextAccessToken,
        refresh_token: nextRefreshToken,
      },
      user.value
    )
  }

  const ensureFreshToken = async () => {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }
    await refreshPromise
  }

  const api = $fetch.create({
    baseURL: config.public.apiBase,
    async onRequest({ options }) {
      const opts = options as typeof options & { _auth?: boolean }
      if (!opts._auth || !accessToken.value) {
        return
      }

      options.headers = {
        ...(options.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${accessToken.value}`,
      }
    },
    async onResponseError(ctx) {
      const status = ctx.response?.status
      const opts = ctx.options as typeof ctx.options & { _auth?: boolean; _retried?: boolean }
      const requestUrl = String(ctx.request)

      if (status !== 401 || !opts._auth) {
        throw ctx.error
      }

      if (opts._retried) {
        clearAuth()
        throw ctx.error
      }

      const isAuthEndpoint =
        requestUrl.includes('/auth/refresh') ||
        requestUrl.includes('/auth/signin') ||
        requestUrl.includes('/auth/signup')

      if (isAuthEndpoint) {
        clearAuth()
        throw ctx.error
      }

      try {
        await ensureFreshToken()
        const retryHeaders = {
          ...(ctx.options.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${accessToken.value}`,
        }

        return await api(ctx.request, {
          ...ctx.options,
          headers: retryHeaders,
          _retried: true,
        })
      } catch {
        clearAuth()
        throw ctx.error
      }
    },
  })

  const apiFetch = async <T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'
      body?: unknown
      auth?: boolean
      query?: Record<string, string | number | boolean | null | undefined>
      _retried?: boolean
    } = {}
  ): Promise<T> => {
    const headers: Record<string, string> = {}
    const isFormData = options.body instanceof FormData

    if (!isFormData) {
      headers['Content-Type'] = 'application/json'
    }

    return await api<T>(path, {
      method: options.method ?? 'GET',
      body: options.body,
      query: options.query,
      headers,
      _auth: options.auth ?? false,
      _retried: options._retried ?? false,
    })
  }

  const signUp = (payload: Credentials) =>
    apiFetch<AuthResponse>('/auth/signup', { method: 'POST', body: payload })

  const signIn = (payload: Credentials) =>
    apiFetch<AuthResponse>('/auth/signin', { method: 'POST', body: payload })

  const me = () => apiFetch<AuthUser>('/auth/me', { auth: true })

  const refreshSession = (refreshToken: string) =>
    apiFetch<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    })

  const logout = () =>
    apiFetch<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      auth: true,
      body: { scope: 'global' },
    })

  const toAskBody = (payload: QueryRequest) => {
    if (!(payload.attachment instanceof File)) {
      return payload
    }

    const formData = new FormData()
    formData.set('query', payload.query)
    formData.set('attachment', payload.attachment)

    if (typeof payload.top_k === 'number') {
      formData.set('top_k', String(payload.top_k))
    }
    if (payload.model) {
      formData.set('model', payload.model)
    }
    if (payload.attachment_id) {
      formData.set('attachment_id', payload.attachment_id)
    }
    if (payload.image) {
      formData.set('image', payload.image)
    }
    if (Array.isArray(payload.folder_ids)) {
      for (const folderId of payload.folder_ids) {
        formData.append('folder_ids', folderId)
      }
    }
    if (Array.isArray(payload.file_ids)) {
      for (const fileId of payload.file_ids) {
        formData.append('file_ids', fileId)
      }
    }

    return formData
  }

  const askPublic = (payload: QueryRequest) =>
    apiFetch<QueryResponse>('/ask', { method: 'POST', body: toAskBody(payload) })

  const askAuth = (payload: QueryRequest) =>
    apiFetch<QueryResponse>('/ask_auth', {
      method: 'POST',
      body: toAskBody(payload),
      auth: true,
    })

  const uploadFile = (file: File) => {
    const formData = new FormData()
    formData.set('file', file)
    return apiFetch<FileUploadResponse>('/files/upload', {
      method: 'POST',
      body: formData,
      auth: true,
    })
  }

  const uploadFolderFiles = (payload: FormData) =>
    apiFetch<FolderUploadResponse>('/kb/folders/upload', {
      method: 'POST',
      body: payload,
      auth: true,
    })

  const getKbTree = () =>
    apiFetch<{ folders?: unknown[]; files?: unknown[]; tree?: unknown[]; root_files?: unknown[] }>('/kb/tree', {
      auth: true,
    })

  const createKbFolder = (payload: { name: string; parent_id?: string | null }) =>
    apiFetch<KbFolder>('/kb/folders', {
      method: 'POST',
      body: payload,
      auth: true,
    })

  const deleteKbFolder = (folderId: string) =>
    apiFetch<{ ok: boolean }>(`/kb/folders/${folderId}`, {
      method: 'DELETE',
      auth: true,
    })

  const moveKbFolder = (folderId: string, parentId: string | null) =>
    apiFetch<KbFolder>(`/kb/folders/${folderId}`, {
      method: 'PATCH',
      body: { parent_id: parentId },
      auth: true,
    })

  const getKbFiles = (folderId?: string | null) =>
    apiFetch<{ files?: KbFile[]; data?: KbFile[]; items?: KbFile[] }>('/kb/files', {
      auth: true,
      query: folderId ? { folder_id: folderId } : undefined,
    })

  const linkKbFile = (payload: { file_id: string; folder_id?: string | null }) =>
    apiFetch<KbFile>('/kb/files', {
      method: 'POST',
      body: payload,
      auth: true,
    })

  const deleteKbFile = (fileId: string) =>
    apiFetch<{ ok: boolean }>(`/kb/files/${fileId}`, {
      method: 'DELETE',
      auth: true,
    })

  const deleteUploadedFile = (fileId: string) =>
    apiFetch<{ ok: boolean }>(`/files/${fileId}`, {
      method: 'DELETE',
      auth: true,
    })

  const getFileProcessing = (fileId: string) =>
    apiFetch<FileProcessingResponse>(`/files/${fileId}/processing`, {
      auth: true,
    })

  const reindexFile = (fileId: string) =>
    apiFetch<{ jobs?: Array<Record<string, unknown>>; [key: string]: unknown }>(`/files/${fileId}/reindex`, {
      method: 'POST',
      auth: true,
    })

  const listIngestJobs = (params?: { status?: IngestJobStatus; limit?: number }) =>
    apiFetch<{ data: IngestJob[] }>('/ingest/jobs', {
      auth: true,
      query: {
        status: params?.status,
        limit: params?.limit,
      },
    })

  const retryIngestJob = (jobId: string) =>
    apiFetch<{ job?: IngestJob }>(`/ingest/jobs/${jobId}/retry`, {
      method: 'POST',
      auth: true,
    })

  const getIngestJob = (jobId: string) =>
    apiFetch<IngestJobResponse>(`/ingest/jobs/${jobId}`, {
      auth: true,
    })

  const listIngestDlq = (params?: { limit?: number }) =>
    apiFetch<{ data: IngestDlqItem[] }>('/ingest/dlq', {
      auth: true,
      query: {
        limit: params?.limit,
      },
    })

  const requeueIngestDlqItem = (dlqId: number) =>
    apiFetch<{ job?: IngestJob }>(`/ingest/dlq/${dlqId}/requeue`, {
      method: 'POST',
      auth: true,
    })

  const adminConsistencyCleanup = (params: {
    dry_run: boolean
    cleanup_missing_storage_records?: boolean
    cleanup_orphan_uploads?: boolean
    cleanup_orphan_vectors?: boolean
    uploads_min_age_seconds?: number
    limit?: number
  }) =>
    apiFetch<Record<string, unknown>>('/admin/consistency/cleanup', {
      method: 'POST',
      auth: true,
      query: params,
    })

  const adminConsistencyReindex = (params: {
    user_id?: string
    limit?: number
    only_missing_vectors?: boolean
  }) =>
    apiFetch<Record<string, unknown>>('/admin/consistency/reindex', {
      method: 'POST',
      auth: true,
      query: params,
    })

  const getMetricsText = async () => {
    return await $fetch<string>('/metrics', {
      baseURL: config.public.apiBase,
      responseType: 'text',
    })
  }

  const getModels = () =>
    apiFetch<{ models?: unknown[]; data?: unknown[]; items?: unknown[]; [key: string]: unknown }>('/models', {
      auth: true,
    })

  const getHistory = () => apiFetch<HistoryResponse>('/history', { auth: true })

  const deleteHistory = (id: number) =>
    apiFetch<{ ok: boolean }>(`/history/${id}`, {
      method: 'DELETE',
      auth: true,
    })

  const embedText = (payload: TextEmbeddingRequest) =>
    apiFetch<EmbeddingResponse>('/embed/text', {
      method: 'POST',
      body: payload,
    })

  const embedImage = (payload: ImageEmbeddingRequest) =>
    apiFetch<EmbeddingResponse>('/embed/image', {
      method: 'POST',
      body: payload,
    })

  const embedVideo = (payload: VideoEmbeddingRequest) =>
    apiFetch<EmbeddingResponse>('/embed/video', {
      method: 'POST',
      body: payload,
    })

  return {
    signUp,
    signIn,
    me,
    refreshSession,
    logout,
    askPublic,
    askAuth,
    uploadFile,
    uploadFolderFiles,
    getKbTree,
    createKbFolder,
    deleteKbFolder,
    moveKbFolder,
    getKbFiles,
    linkKbFile,
    deleteKbFile,
    deleteUploadedFile,
    getFileProcessing,
    reindexFile,
    listIngestJobs,
    getIngestJob,
    retryIngestJob,
    listIngestDlq,
    requeueIngestDlqItem,
    adminConsistencyCleanup,
    adminConsistencyReindex,
    getMetricsText,
    getModels,
    getHistory,
    deleteHistory,
    embedText,
    embedImage,
    embedVideo,
  }
}
