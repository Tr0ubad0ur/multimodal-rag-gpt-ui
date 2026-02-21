<script setup lang="ts">
import type { HistoryItem, QueryResponse, RetrievedDoc } from '~/types/api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  docs?: RetrievedDoc[]
}

const {
  signIn,
  signUp,
  logout,
  askPublic,
  askAuth,
  getHistory,
  deleteHistory,
  me,
  refreshSession,
} = useApi()

const { user, session, isAuthenticated, hydrate, setAuth, clearAuth } = useAuth()
const config = useRuntimeConfig()
const { t } = useI18n()

const nextMessageId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`

const messages = ref<Message[]>([
  {
    id: nextMessageId(),
    role: 'assistant',
    content:
      'Готов к мультимодальному RAG-поиску. Введи вопрос, при необходимости добавь URL изображения и получи ответ с найденными фрагментами.',
  },
])
const history = ref<HistoryItem[]>([])
const selectedHistoryId = ref<number | null>(null)

const chatBusy = ref(false)
const authBusy = ref(false)
const historyBusy = ref(false)
const errorText = ref('')

const userEmail = computed(() => user.value?.email ?? '')

const pushAssistantMessage = (response: QueryResponse) => {
  messages.value.push({
    id: nextMessageId(),
    role: 'assistant',
    content: response.answer || 'Ответ не получен.',
    docs: response.retrieved_docs ?? undefined,
  })
}

const parseError = (error: unknown): string => {
  if (error && typeof error === 'object' && 'data' in error) {
    const e = error as { data?: { detail?: string } }
    if (e.data?.detail) {
      return e.data.detail
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Request failed'
}

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
    errorText.value = `${t('historyError')}: ${parseError(error)}`
  } finally {
    historyBusy.value = false
  }
}

const handleAsk = async (payload: {
  query: string
  top_k: number
  image?: string
}) => {
  chatBusy.value = true
  errorText.value = ''

  messages.value.push({
    id: nextMessageId(),
    role: 'user',
    content: payload.query,
  })

  try {
    const response = isAuthenticated.value
      ? await askAuth(payload)
      : await askPublic(payload)

    pushAssistantMessage(response)

    if (isAuthenticated.value) {
      await loadHistory()
    }
  } catch (error) {
    errorText.value = `${t('errorPrefix')}: ${parseError(error)}`
    messages.value.push({
      id: nextMessageId(),
      role: 'assistant',
      content: errorText.value,
    })
  } finally {
    chatBusy.value = false
  }
}

const handleSignIn = async (payload: { email: string; password: string }) => {
  authBusy.value = true
  errorText.value = ''
  try {
    const result = await signIn(payload)
    if (!result.session || !result.user) {
      throw new Error('No session returned by backend')
    }

    setAuth(result.session, result.user)
    await loadHistory()
  } catch (error) {
    errorText.value = `${t('signInError')}: ${parseError(error)}`
  } finally {
    authBusy.value = false
  }
}

const handleSignUp = async (payload: { email: string; password: string }) => {
  authBusy.value = true
  errorText.value = ''
  try {
    const result = await signUp(payload)
    if (result.session && result.user) {
      setAuth(result.session, result.user)
      await loadHistory()
      return
    }

    errorText.value = t('signUpDone')
  } catch (error) {
    errorText.value = `${t('signUpError')}: ${parseError(error)}`
  } finally {
    authBusy.value = false
  }
}

const handleLogout = async () => {
  authBusy.value = true
  errorText.value = ''
  try {
    if (isAuthenticated.value) {
      await logout()
    }
  } catch {
    // Ignore logout errors and clear local session anyway.
  } finally {
    clearAuth()
    history.value = []
    authBusy.value = false
  }
}

const handleDeleteHistory = async (id: number) => {
  historyBusy.value = true
  errorText.value = ''
  try {
    await deleteHistory(id)
    history.value = history.value.filter((item) => item.id !== id)
    if (selectedHistoryId.value === id) {
      selectedHistoryId.value = null
    }
  } catch (error) {
    errorText.value = `${t('deleteError')}: ${parseError(error)}`
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
      docs: item.retrieved_docs ?? undefined,
    }
  )
}

onMounted(async () => {
  hydrate()

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
})
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[19rem_1fr_19rem]">
    <aside class="order-2 lg:order-1">
      <HistoryPanel
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

        <div class="space-y-3">
          <ChatMessage
            v-for="message in messages"
            :key="message.id"
            :role="message.role"
            :content="message.content"
            :docs="message.docs"
          />
        </div>

        <ChatComposer :busy="chatBusy" @send="handleAsk" />

        <p v-if="errorText" class="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ errorText }}
        </p>
      </div>
    </section>

    <aside class="order-3">
      <AuthPanel
        :busy="authBusy"
        :authenticated="isAuthenticated"
        :user-email="userEmail"
        @signin="handleSignIn"
        @signup="handleSignUp"
        @logout="handleLogout"
      />
    </aside>
  </div>
</template>
