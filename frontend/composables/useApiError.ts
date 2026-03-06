export interface ParsedApiError {
  status: number | null
  detail: string
}

export const parseApiError = (error: unknown): ParsedApiError => {
  if (error && typeof error === 'object') {
    const source = error as {
      data?: { detail?: string }
      response?: { status?: number }
      status?: number
      statusCode?: number
      message?: string
    }

    const status =
      (typeof source.statusCode === 'number' ? source.statusCode : null) ??
      (typeof source.status === 'number' ? source.status : null) ??
      (typeof source.response?.status === 'number' ? source.response.status : null)

    const detail =
      (typeof source.data?.detail === 'string' && source.data.detail.trim()
        ? source.data.detail.trim()
        : null) ??
      (typeof source.message === 'string' && source.message.trim() ? source.message.trim() : null) ??
      'Request failed'

    return { status, detail }
  }

  if (error instanceof Error) {
    return {
      status: null,
      detail: error.message,
    }
  }

  return {
    status: null,
    detail: 'Request failed',
  }
}

export const formatRateAndQuotaError = (
  parsed: ParsedApiError,
  fallbackPrefix: string
): string => {
  if (parsed.status === 429) {
    return `${fallbackPrefix}: превышен лимит запросов`
  }

  if (parsed.status === 413) {
    return `${fallbackPrefix}: превышена квота файлов/объема`
  }

  return `${fallbackPrefix}: ${parsed.detail}`
}
