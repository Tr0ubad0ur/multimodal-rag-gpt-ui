<script setup lang="ts">
import type { HistoryItem, QueryResponse, RetrievedDoc } from '~/types/api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  docs?: RetrievedDoc[]
}

interface AskPayload {
  query: string
  top_k: number
  image?: string
}

type RetryAction = 'ask' | 'history' | 'signin' | 'signup' | 'delete' | null

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

const chatScrollEl = ref<HTMLElement | null>(null)
const chatBusy = ref(false)
const authBusy = ref(false)
const historyBusy = ref(false)
const errorText = ref('')
const retryAction = ref<RetryAction>(null)
const lastAskPayload = ref<AskPayload | null>(null)
const lastDeleteId = ref<number | null>(null)
const lastAuthPayload = ref<{ mode: 'signin' | 'signup'; payload: { email: string; password: string } } | null>(null)

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
    const response = isAuthenticated.value
      ? await askAuth(payload)
      : await askPublic(payload)

    pushAssistantMessage(response)
    await scrollMessagesToBottom()

    if (isAuthenticated.value) {
      await loadHistory()
    }
  } catch (error) {
    errorText.value = `${t('errorPrefix')}: ${parseError(error)}`
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
    await loadHistory()
  } catch (error) {
    errorText.value = `${t('signInError')}: ${parseError(error)}`
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
      await loadHistory()
      return
    }

    errorText.value = t('signUpDone')
    retryAction.value = null
  } catch (error) {
    errorText.value = `${t('signUpError')}: ${parseError(error)}`
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
    authBusy.value = false
  }
}

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
    errorText.value = `${t('deleteError')}: ${parseError(error)}`
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
      docs: item.retrieved_docs ?? undefined,
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

  await scrollMessagesToBottom()
})
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)_18rem]">
    <aside class="order-2 lg:order-1 lg:sticky lg:top-6 lg:self-start">
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
        <BaseCard :padded="false" class="overflow-hidden">
          <div class="border-b border-line bg-surface-muted/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {{ t('chatTitle') }}
          </div>
          <div ref="chatScrollEl" class="max-h-[58vh] space-y-3 overflow-y-auto p-4">
            <div v-if="!hasUserMessages" class="rounded-xl border border-line bg-surface-muted/60 p-4 text-sm text-muted">
              <p class="font-medium text-foreground">{{ t('chatEmptyTitle') }}</p>
              <p class="mt-1">{{ t('chatEmptyHint') }}</p>
            </div>

            <ChatMessage
              v-for="message in messages"
              :key="message.id"
              :role="message.role"
              :content="message.content"
              :docs="message.docs"
            />

            <article v-if="chatBusy" class="mr-auto max-w-4xl rounded-2xl border border-line bg-surface p-4 shadow-sm ui-pulse">
              <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{{ t('assistant') }}</p>
              <BaseSkeleton :lines="2" />
            </article>
          </div>
        </BaseCard>

        <div>
          <ChatComposer :busy="chatBusy" @send="handleAsk" />
        </div>

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
