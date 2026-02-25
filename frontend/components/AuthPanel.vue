<script setup lang="ts">
const { t } = useI18n()

interface Credentials {
  email: string
  password: string
}

const props = defineProps<{
  busy?: boolean
  authenticated: boolean
  userEmail?: string
}>()

const emit = defineEmits<{
  signin: [payload: Credentials]
  signup: [payload: Credentials]
  logout: []
}>()

const mode = ref<'signin' | 'signup'>('signin')
const email = ref('')
const password = ref('')

const submit = () => {
  const payload = {
    email: email.value.trim(),
    password: password.value,
  }

  if (!payload.email || !payload.password) {
    return
  }

  if (mode.value === 'signin') {
    emit('signin', payload)
  } else {
    emit('signup', payload)
  }
}

watch(
  () => props.authenticated,
  (next) => {
    if (next) {
      password.value = ''
    }
  }
)
</script>

<template>
  <BaseCard>
    <h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('authTitle') }}</h2>

    <div v-if="authenticated" class="mt-4 space-y-3">
      <p class="text-sm text-foreground">
        {{ t('signedInAs') }}
        <span class="font-semibold text-foreground">{{ userEmail || 'user' }}</span>
      </p>
      <BaseButton
        variant="secondary"
        block
        :disabled="busy"
        @click="emit('logout')"
      >
        {{ t('logout') }}
      </BaseButton>
    </div>

    <div v-else class="mt-4">
      <div class="mb-3 grid grid-cols-2 rounded-xl bg-surface-muted p-1 text-sm">
        <button
          class="rounded-lg px-2 py-1.5 transition"
          :class="mode === 'signin' ? 'bg-surface font-semibold text-foreground shadow-sm' : 'text-muted'"
          :aria-pressed="mode === 'signin'"
          @click="mode = 'signin'"
        >
          {{ t('signIn') }}
        </button>
        <button
          class="rounded-lg px-2 py-1.5 transition"
          :class="mode === 'signup' ? 'bg-surface font-semibold text-foreground shadow-sm' : 'text-muted'"
          :aria-pressed="mode === 'signup'"
          @click="mode = 'signup'"
        >
          {{ t('signUp') }}
        </button>
      </div>

      <form class="space-y-2" @submit.prevent="submit">
        <BaseInput
          v-model="email"
          type="email"
          autocomplete="email"
          :placeholder="t('emailPlaceholder')"
        />
        <BaseInput
          v-model="password"
          type="password"
          autocomplete="current-password"
          :placeholder="t('passwordPlaceholder')"
        />
        <BaseButton
          type="submit"
          variant="primary"
          block
          :disabled="busy"
        >
          {{ mode === 'signin' ? t('signIn') : t('signUp') }}
        </BaseButton>
      </form>
    </div>
  </BaseCard>
</template>
