<script setup lang="ts">
import type { SourceModality } from '~/types/api'

const { t } = useI18n()
const config = useRuntimeConfig()
const { accessToken } = useAuth()

interface MessageSource {
  fileId: string
  modality: SourceModality
  score: number | null
  previewRef: string | null
  source: string
}

const props = defineProps<{
  role: 'user' | 'assistant'
  content: string
  sources?: MessageSource[]
}>()

const previewError = ref('')

const modalityLabelMap: Record<SourceModality, string> = {
  text: 'text',
  image: 'image',
  video: 'video',
}

const modalityToneMap: Record<SourceModality, string> = {
  text: 'bg-sky-100 text-sky-800',
  image: 'bg-amber-100 text-amber-800',
  video: 'bg-emerald-100 text-emerald-800',
}

const resolvePreviewUrl = (previewRef: string) => {
  if (/^https?:\/\//i.test(previewRef)) {
    return previewRef
  }

  const base = config.public.apiBase.endsWith('/')
    ? config.public.apiBase.slice(0, -1)
    : config.public.apiBase
  const path = previewRef.startsWith('/') ? previewRef : `/${previewRef}`
  return `${base}${path}`
}

const openPreview = async (source: MessageSource) => {
  previewError.value = ''

  if (!source.previewRef) {
    return
  }

  const resolvedUrl = resolvePreviewUrl(source.previewRef)
  const isAbsolute = /^https?:\/\//i.test(source.previewRef)

  if (isAbsolute || !accessToken.value) {
    window.open(resolvedUrl, '_blank', 'noopener,noreferrer')
    return
  }

  try {
    const response = await fetch(resolvedUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
      },
    })

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (!response.ok || contentType.includes('application/json')) {
      let message = `Preview failed: ${response.status}`
      try {
        const payload = (await response.json()) as { detail?: string }
        if (typeof payload?.detail === 'string' && payload.detail.trim()) {
          message = payload.detail
        }
      } catch {}
      throw new Error(message)
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch (error) {
    previewError.value = error instanceof Error ? error.message : t('previewUnavailable')
  }
}
</script>

<template>
  <article class="ui-fade-up rounded-2xl border p-4 shadow-sm" :class="role === 'user' ? 'ml-auto max-w-3xl border-brand/45 bg-brand-soft' : 'mr-auto max-w-4xl border-line bg-surface'">
    <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em]" :class="role === 'user' ? 'text-brand-strong' : 'text-muted'">
      {{ role === 'user' ? t('you') : t('assistant') }}
    </p>
    <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{{ content }}</p>

    <details v-if="role === 'assistant' && props.sources?.length" class="mt-3 rounded-lg border border-line bg-surface-muted p-3 text-sm">
      <summary class="cursor-pointer font-medium text-foreground">{{ t('usedSources') }} ({{ props.sources.length }})</summary>
      <p v-if="previewError" class="mt-2 text-xs text-rose-700">{{ previewError }}</p>
      <ul class="mt-2 space-y-2">
        <li v-for="(source, index) in props.sources" :key="`${source.fileId}-${index}`" class="rounded-md border border-line bg-surface p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]" :class="modalityToneMap[source.modality]">
              {{ modalityLabelMap[source.modality] }}
            </span>
            <span class="text-xs text-muted">file_id: {{ source.fileId }}</span>
            <span class="text-xs text-muted">{{ t('score') }}: {{ source.score === null ? 'n/a' : source.score.toFixed(4) }}</span>
          </div>
          <p class="mt-2 text-xs font-medium text-foreground">{{ t('source') }}: {{ source.source }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span class="text-muted">preview_ref: {{ source.previewRef || 'n/a' }}</span>
            <button
              v-if="source.previewRef"
              type="button"
              class="rounded-md border border-line px-2 py-1 font-medium text-foreground transition hover:bg-surface-muted"
              @click="openPreview(source)"
            >
              {{ t('openPreview') }}
            </button>
          </div>
        </li>
      </ul>
    </details>
  </article>
</template>
