<script setup lang="ts">
import type { IngestDlqItem, IngestJob, IngestJobStatus } from '~/types/api'
import { formatRateAndQuotaError, parseApiError } from '~/composables/useApiError'

interface IngestMetricsSnapshot {
  queueDepth: Record<IngestJobStatus, number>
  dlqDepth: number
  failedCounter: number
  retryCounter: number
  dlqCounter: number
}

const { t } = useI18n()
const { isAuthenticated } = useAuth()
const {
  listIngestJobs,
  listIngestDlq,
  requeueIngestDlqItem,
  adminConsistencyCleanup,
  adminConsistencyReindex,
  getMetricsText,
} = useApi()

const monitorBusy = ref(false)
const adminBusy = ref(false)
const monitorError = ref('')
const monitorInfo = ref('')
const cleanupReport = ref<Record<string, unknown> | null>(null)
const reindexReport = ref<Record<string, unknown> | null>(null)

const jobs = ref<IngestJob[]>([])
const dlqItems = ref<IngestDlqItem[]>([])
const metrics = ref<IngestMetricsSnapshot>({
  queueDepth: {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  },
  dlqDepth: 0,
  failedCounter: 0,
  retryCounter: 0,
  dlqCounter: 0,
})

const statusFilter = ref<'all' | IngestJobStatus>('all')
const userFilter = ref('')

const cleanupLimit = ref(500)
const cleanupMinAgeSeconds = ref(1800)
const cleanupMissingStorage = ref(true)
const cleanupOrphanUploads = ref(true)
const cleanupOrphanVectors = ref(true)

const reindexUserId = ref('')
const reindexLimit = ref(100)
const reindexOnlyMissing = ref(false)

const formatError = (error: unknown): string => formatRateAndQuotaError(parseApiError(error), t('errorPrefix'), t)

const parseMetricLabels = (raw: string): Record<string, string> => {
  if (!raw) {
    return {}
  }
  const labels: Record<string, string> = {}
  const parts = raw.split(',')
  for (const part of parts) {
    const [key, value] = part.split('=')
    if (!key || !value) {
      continue
    }
    labels[key.trim()] = value.trim().replace(/^"|"$/g, '')
  }
  return labels
}

const sumMetric = (
  text: string,
  metricName: string,
  requiredLabels: Record<string, string> = {}
): number => {
  let sum = 0
  const lines = text.split('\n')
  for (const line of lines) {
    if (!line || line.startsWith('#') || !line.startsWith(metricName)) {
      continue
    }

    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(.+)$/)
    if (!match) {
      continue
    }

    const labels = parseMetricLabels(match[3] ?? '')
    const ok = Object.entries(requiredLabels).every(([key, value]) => labels[key] === value)
    if (!ok) {
      continue
    }

    const value = Number(match[4])
    if (Number.isFinite(value)) {
      sum += value
    }
  }
  return sum
}

const loadMonitor = async () => {
  if (!isAuthenticated.value) {
    jobs.value = []
    dlqItems.value = []
    monitorError.value = ''
    monitorInfo.value = ''
    return
  }

  monitorBusy.value = true
  monitorError.value = ''
  monitorInfo.value = ''

  try {
    const [jobsPayload, dlqPayload, metricText] = await Promise.all([
      listIngestJobs({
        status: statusFilter.value === 'all' ? undefined : statusFilter.value,
        limit: 200,
      }),
      listIngestDlq({ limit: 200 }),
      getMetricsText(),
    ])

    jobs.value = jobsPayload.data ?? []
    dlqItems.value = dlqPayload.data ?? []

    metrics.value = {
      queueDepth: {
        queued: sumMetric(metricText, 'ingest_queue_depth', { status: 'queued' }),
        processing: sumMetric(metricText, 'ingest_queue_depth', { status: 'processing' }),
        completed: sumMetric(metricText, 'ingest_queue_depth', { status: 'completed' }),
        failed: sumMetric(metricText, 'ingest_queue_depth', { status: 'failed' }),
      },
      dlqDepth: sumMetric(metricText, 'ingest_dlq_depth'),
      failedCounter: sumMetric(metricText, 'ingest_job_events_total', { event: 'failed', result: 'ok' }),
      retryCounter: sumMetric(metricText, 'ingest_job_events_total', { event: 'retry_scheduled', result: 'ok' }),
      dlqCounter: sumMetric(metricText, 'ingest_job_events_total', { event: 'dlq_insert', result: 'ok' }),
    }
  } catch (error) {
    monitorError.value = formatError(error)
  } finally {
    monitorBusy.value = false
  }
}

const requeueDlq = async (dlqId: number) => {
  monitorBusy.value = true
  monitorError.value = ''
  try {
    await requeueIngestDlqItem(dlqId)
    monitorInfo.value = t('dlqRequeued')
    await loadMonitor()
  } catch (error) {
    monitorError.value = formatError(error)
  } finally {
    monitorBusy.value = false
  }
}

const runCleanup = async (dryRun: boolean) => {
  adminBusy.value = true
  monitorError.value = ''
  try {
    cleanupReport.value = await adminConsistencyCleanup({
      dry_run: dryRun,
      cleanup_missing_storage_records: cleanupMissingStorage.value,
      cleanup_orphan_uploads: cleanupOrphanUploads.value,
      cleanup_orphan_vectors: cleanupOrphanVectors.value,
      uploads_min_age_seconds: Math.max(0, Number(cleanupMinAgeSeconds.value) || 0),
      limit: Math.max(1, Number(cleanupLimit.value) || 1),
    })
    monitorInfo.value = dryRun ? t('cleanupDryRunDone') : t('cleanupExecuteDone')
  } catch (error) {
    monitorError.value = formatError(error)
  } finally {
    adminBusy.value = false
  }
}

const runReindex = async () => {
  adminBusy.value = true
  monitorError.value = ''
  try {
    reindexReport.value = await adminConsistencyReindex({
      user_id: reindexUserId.value.trim() || undefined,
      limit: Math.max(1, Number(reindexLimit.value) || 1),
      only_missing_vectors: reindexOnlyMissing.value,
    })
    monitorInfo.value = t('bulkReindexStarted')
    await loadMonitor()
  } catch (error) {
    monitorError.value = formatError(error)
  } finally {
    adminBusy.value = false
  }
}

const filteredJobs = computed(() => {
  const user = userFilter.value.trim().toLowerCase()
  if (!user) {
    return jobs.value
  }
  return jobs.value.filter((job) => String(job.user_id ?? '').toLowerCase().includes(user))
})

watch(
  () => statusFilter.value,
  () => {
    void loadMonitor()
  }
)

watch(isAuthenticated, (value) => {
  if (!value) {
    jobs.value = []
    dlqItems.value = []
    return
  }
  void loadMonitor()
})

onMounted(() => {
  if (isAuthenticated.value) {
    void loadMonitor()
  }
})
</script>

<template>
  <BaseCard>
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('ingestMonitorTitle') }}</h2>
      <BaseButton size="sm" variant="secondary" :disabled="monitorBusy || !isAuthenticated" @click="loadMonitor">
        {{ t('refresh') }}
      </BaseButton>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div class="rounded-lg border border-line bg-surface p-2">
        <p class="text-muted">{{ t('queueDepthQueued') }}</p>
        <p class="mt-1 text-sm text-foreground">{{ metrics.queueDepth.queued }}</p>
      </div>
      <div class="rounded-lg border border-line bg-surface p-2">
        <p class="text-muted">{{ t('queueDepthProcessing') }}</p>
        <p class="mt-1 text-sm text-foreground">{{ metrics.queueDepth.processing }}</p>
      </div>
      <div class="rounded-lg border border-line bg-surface p-2">
        <p class="text-muted">{{ t('queueDepthCompleted') }}</p>
        <p class="mt-1 text-sm text-foreground">{{ metrics.queueDepth.completed }}</p>
      </div>
      <div class="rounded-lg border border-line bg-surface p-2">
        <p class="text-muted">{{ t('queueDepthFailed') }}</p>
        <p class="mt-1 text-sm text-foreground">{{ metrics.queueDepth.failed }}</p>
      </div>
      <div class="rounded-lg border border-line bg-surface p-2">
        <p class="text-muted">{{ t('dlqDepthLabel') }}</p>
        <p class="mt-1 text-sm text-foreground">{{ metrics.dlqDepth }}</p>
      </div>
      <div class="rounded-lg border border-line bg-surface p-2">
        <p class="text-muted">{{ t('failedCounterLabel') }}</p>
        <p class="mt-1 text-sm text-foreground">{{ metrics.failedCounter }}</p>
      </div>
      <div class="rounded-lg border border-line bg-surface p-2">
        <p class="text-muted">{{ t('retryCounterLabel') }}</p>
        <p class="mt-1 text-sm text-foreground">{{ metrics.retryCounter }}</p>
      </div>
      <div class="rounded-lg border border-line bg-surface p-2">
        <p class="text-muted">{{ t('dlqCounterLabel') }}</p>
        <p class="mt-1 text-sm text-foreground">{{ metrics.dlqCounter }}</p>
      </div>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      <label class="text-xs text-muted">
        {{ t('statusFilterLabel') }}
        <select v-model="statusFilter" class="ui-input mt-1 w-full">
          <option value="all">all</option>
          <option value="queued">queued</option>
          <option value="processing">processing</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
        </select>
      </label>
      <label class="text-xs text-muted">
        {{ t('userFilterLabel') }}
        <BaseInput v-model="userFilter" class="mt-1" :placeholder="t('userFilterPlaceholder')" />
      </label>
    </div>

    <div class="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
      <article v-for="job in filteredJobs" :key="job.id" class="rounded-lg border border-line bg-surface p-2 text-xs">
        <p class="truncate text-foreground">{{ job.file_id }}</p>
        <p class="mt-1 text-muted">{{ job.status }} · {{ new Date(job.created_at || '').toLocaleString() }}</p>
        <p class="mt-1 truncate text-muted">job: {{ job.id }}</p>
        <p v-if="job.error" class="mt-1 line-clamp-2 text-danger">{{ job.error }}</p>
      </article>
      <p v-if="!filteredJobs.length" class="text-xs text-muted">{{ t('noJobsFound') }}</p>
    </div>

    <div class="mt-3 border-t border-line pt-3">
      <h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted">DLQ</h3>
      <div class="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1">
        <article v-for="item in dlqItems" :key="item.id" class="rounded-lg border border-line bg-surface p-2 text-xs">
          <p class="truncate text-foreground">job: {{ item.job_id }}</p>
          <p class="mt-1 text-muted">{{ item.reason || 'n/a' }}</p>
          <div class="mt-2 flex justify-end">
            <BaseButton size="sm" variant="secondary" :disabled="monitorBusy" @click="requeueDlq(item.id)">
              {{ t('requeueDlq') }}
            </BaseButton>
          </div>
        </article>
        <p v-if="!dlqItems.length" class="text-xs text-muted">{{ t('noDlqItems') }}</p>
      </div>
    </div>

    <div class="mt-3 border-t border-line pt-3">
      <h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{{ t('adminConsistencyTitle') }}</h3>

      <div class="mt-2 space-y-2 text-xs">
        <label class="flex items-center gap-2 text-muted">
          <input v-model="cleanupMissingStorage" type="checkbox">
          cleanup_missing_storage_records
        </label>
        <label class="flex items-center gap-2 text-muted">
          <input v-model="cleanupOrphanUploads" type="checkbox">
          cleanup_orphan_uploads
        </label>
        <label class="flex items-center gap-2 text-muted">
          <input v-model="cleanupOrphanVectors" type="checkbox">
          cleanup_orphan_vectors
        </label>
      </div>

      <div class="mt-2 grid grid-cols-2 gap-2">
        <label class="text-xs text-muted">
          limit
          <BaseInput v-model="cleanupLimit" class="mt-1" type="number" min="1" />
        </label>
        <label class="text-xs text-muted">
          uploads_min_age_seconds
          <BaseInput v-model="cleanupMinAgeSeconds" class="mt-1" type="number" min="0" />
        </label>
      </div>

      <div class="mt-2 flex gap-2">
        <BaseButton size="sm" variant="secondary" :disabled="adminBusy || !isAuthenticated" @click="runCleanup(true)">
          {{ t('cleanupDryRun') }}
        </BaseButton>
        <BaseButton size="sm" variant="danger" :disabled="adminBusy || !isAuthenticated" @click="runCleanup(false)">
          {{ t('cleanupExecute') }}
        </BaseButton>
      </div>

      <div class="mt-3 border-t border-line pt-3">
        <h4 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{{ t('bulkReindexTitle') }}</h4>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <label class="text-xs text-muted col-span-2">
            user_id
            <BaseInput v-model="reindexUserId" class="mt-1" :placeholder="t('optionalUserId')" />
          </label>
          <label class="text-xs text-muted">
            limit
            <BaseInput v-model="reindexLimit" class="mt-1" type="number" min="1" />
          </label>
          <label class="flex items-center gap-2 text-xs text-muted">
            <input v-model="reindexOnlyMissing" type="checkbox">
            only_missing_vectors
          </label>
        </div>
        <div class="mt-2 flex justify-start">
          <BaseButton size="sm" variant="primary" :disabled="adminBusy || !isAuthenticated" @click="runReindex">
            {{ t('runBulkReindex') }}
          </BaseButton>
        </div>
      </div>

      <pre v-if="cleanupReport" class="mt-2 max-h-32 overflow-auto rounded-lg border border-line bg-surface p-2 text-[11px] text-muted">{{ JSON.stringify(cleanupReport, null, 2) }}</pre>
      <pre v-if="reindexReport" class="mt-2 max-h-32 overflow-auto rounded-lg border border-line bg-surface p-2 text-[11px] text-muted">{{ JSON.stringify(reindexReport, null, 2) }}</pre>
    </div>

    <BaseAlert v-if="monitorBusy || adminBusy" tone="info" class="mt-3" role="status">
      {{ t('processing') }}
    </BaseAlert>
    <BaseAlert v-if="monitorInfo" tone="info" class="mt-3" role="status">
      {{ monitorInfo }}
    </BaseAlert>
    <BaseAlert v-if="monitorError" tone="danger" class="mt-3" role="alert">
      {{ monitorError }}
    </BaseAlert>
  </BaseCard>
</template>
