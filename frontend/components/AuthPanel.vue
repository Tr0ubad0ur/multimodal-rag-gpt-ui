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
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
    <h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{{ t('authTitle') }}</h2>

    <div v-if="authenticated" class="mt-4 space-y-3">
      <p class="text-sm text-slate-700 dark:text-slate-200">
        {{ t('signedInAs') }}
        <span class="font-semibold text-slate-900 dark:text-white">{{ userEmail || 'user' }}</span>
      </p>
      <button
        class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        :disabled="busy"
        @click="emit('logout')"
      >
        {{ t('logout') }}
      </button>
    </div>

    <div v-else class="mt-4">
      <div class="mb-3 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800">
        <button
          class="rounded-lg px-2 py-1.5 transition"
          :class="mode === 'signin' ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'"
          @click="mode = 'signin'"
        >
          {{ t('signIn') }}
        </button>
        <button
          class="rounded-lg px-2 py-1.5 transition"
          :class="mode === 'signup' ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'"
          @click="mode = 'signup'"
        >
          {{ t('signUp') }}
        </button>
      </div>

      <form class="space-y-2" @submit.prevent="submit">
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          :placeholder="t('emailPlaceholder')"
          class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-500 transition focus:ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          :placeholder="t('passwordPlaceholder')"
          class="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-cyan-500 transition focus:ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
        <button
          type="submit"
          class="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          :disabled="busy"
        >
          {{ mode === 'signin' ? t('signIn') : t('signUp') }}
        </button>
      </form>
    </div>
  </section>
</template>
