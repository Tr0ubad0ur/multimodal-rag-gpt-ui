import type { AuthSession, AuthUser } from '~/types/api'

const STORAGE_KEY = 'mmrag-auth-session'

interface PersistedAuth {
  session: AuthSession | null
  user: AuthUser | null
}

export const useAuth = () => {
  const session = useState<AuthSession | null>('auth:session', () => null)
  const user = useState<AuthUser | null>('auth:user', () => null)

  const accessToken = computed(() => session.value?.access_token ?? null)
  const isAuthenticated = computed(() => Boolean(accessToken.value))

  const persist = () => {
    if (!import.meta.client) {
      return
    }

    const payload: PersistedAuth = {
      session: session.value,
      user: user.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  const hydrate = () => {
    if (!import.meta.client) {
      return
    }

    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return
    }

    try {
      const parsed = JSON.parse(raw) as PersistedAuth
      session.value = parsed.session
      user.value = parsed.user
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  const setAuth = (nextSession: AuthSession | null, nextUser: AuthUser | null) => {
    session.value = nextSession
    user.value = nextUser
    persist()
  }

  const clearAuth = () => {
    session.value = null
    user.value = null

    if (!import.meta.client) {
      return
    }
    localStorage.removeItem(STORAGE_KEY)
  }

  return {
    session,
    user,
    accessToken,
    isAuthenticated,
    hydrate,
    setAuth,
    clearAuth,
  }
}
