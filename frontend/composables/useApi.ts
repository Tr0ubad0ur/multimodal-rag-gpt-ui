import type {
  AuthResponse,
  AuthUser,
  HistoryResponse,
  QueryRequest,
  QueryResponse,
} from '~/types/api'

interface Credentials {
  email: string
  password: string
}

export const useApi = () => {
  const config = useRuntimeConfig()
  const { accessToken } = useAuth()

  const apiFetch = async <T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE'
      body?: unknown
      auth?: boolean
    } = {}
  ): Promise<T> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (options.auth && accessToken.value) {
      headers.Authorization = `Bearer ${accessToken.value}`
    }

    return await $fetch<T>(path, {
      baseURL: config.public.apiBase,
      method: options.method ?? 'GET',
      body: options.body,
      headers,
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

  const askPublic = (payload: QueryRequest) =>
    apiFetch<QueryResponse>('/ask', { method: 'POST', body: payload })

  const askAuth = (payload: QueryRequest) =>
    apiFetch<QueryResponse>('/ask_auth', {
      method: 'POST',
      body: payload,
      auth: true,
    })

  const getHistory = () => apiFetch<HistoryResponse>('/history', { auth: true })

  const deleteHistory = (id: number) =>
    apiFetch<{ ok: boolean }>(`/history/${id}`, {
      method: 'DELETE',
      auth: true,
    })

  return {
    signUp,
    signIn,
    me,
    refreshSession,
    logout,
    askPublic,
    askAuth,
    getHistory,
    deleteHistory,
  }
}
