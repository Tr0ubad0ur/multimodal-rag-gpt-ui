export interface ParsedApiError {
  status: number | null
  detail: string
  errorCode: string | null
  validationErrors: Array<{
    field: string | null
    message: string
    code: string | null
  }>
}

type TranslateFn = (key: string) => string

const ERROR_CODE_TO_MESSAGE_KEY: Record<string, string> = {
  ask_rate_limit_exceeded: 'apiErrorAskRateLimitExceeded',
  upload_rate_limit_exceeded: 'apiErrorUploadRateLimitExceeded',
  user_file_quota_exceeded: 'apiErrorUserFileQuotaExceeded',
  user_storage_quota_exceeded: 'apiErrorUserStorageQuotaExceeded',
  file_is_too_large: 'apiErrorFileIsTooLarge',
  unsupported_mime_type: 'apiErrorUnsupportedMimeType',
  validation_error: 'apiErrorValidationError',
  invalid_email_or_password: 'apiErrorInvalidEmailOrPassword',
  missing_or_invalid_authorization_header: 'apiErrorMissingOrInvalidAuthorizationHeader',
  invalid_or_expired_token: 'apiErrorInvalidOrExpiredToken',
  ingest_job_not_found: 'apiErrorIngestJobNotFound',
  only_failed_jobs_can_be_retried: 'apiErrorOnlyFailedJobsCanBeRetried',
  ingest_dlq_item_not_requeueable: 'apiErrorIngestDlqItemNotRequeueable',
}

export const parseApiError = (error: unknown): ParsedApiError => {
  if (error && typeof error === 'object') {
    const source = error as {
      data?: {
        detail?: string
        error_code?: string
        status_code?: number
        errors?: Array<{ field?: string; message?: string; code?: string }>
      }
      response?: { status?: number }
      status?: number
      statusCode?: number
      message?: string
    }

    const status =
      (typeof source.data?.status_code === 'number' ? source.data.status_code : null) ??
      (typeof source.statusCode === 'number' ? source.statusCode : null) ??
      (typeof source.status === 'number' ? source.status : null) ??
      (typeof source.response?.status === 'number' ? source.response.status : null)

    const errorCode =
      typeof source.data?.error_code === 'string' && source.data.error_code.trim()
        ? source.data.error_code.trim()
        : null

    const detail =
      (typeof source.data?.detail === 'string' && source.data.detail.trim()
        ? source.data.detail.trim()
        : null) ??
      (typeof source.message === 'string' && source.message.trim() ? source.message.trim() : null) ??
      'Request failed'

    const validationErrors = Array.isArray(source.data?.errors)
      ? source.data.errors
          .map((item) => {
            const message = typeof item?.message === 'string' && item.message.trim()
              ? item.message.trim()
              : null
            if (!message) {
              return null
            }
            return {
              field: typeof item?.field === 'string' && item.field.trim() ? item.field.trim() : null,
              message,
              code: typeof item?.code === 'string' && item.code.trim() ? item.code.trim() : null,
            }
          })
          .filter((item): item is { field: string | null; message: string; code: string | null } => Boolean(item))
      : []

    return { status, detail, errorCode, validationErrors }
  }

  if (error instanceof Error) {
    return {
      status: null,
      detail: error.message,
      errorCode: null,
      validationErrors: [],
    }
  }

  return {
    status: null,
    detail: 'Request failed',
    errorCode: null,
    validationErrors: [],
  }
}

export const formatRateAndQuotaError = (
  parsed: ParsedApiError,
  fallbackPrefix: string,
  t?: TranslateFn
): string => {
  if (parsed.errorCode === 'validation_error') {
    const validationSummary = parsed.validationErrors
      .map((item) => (item.field ? `${item.field}: ${item.message}` : item.message))
      .join('; ')

    return validationSummary
      ? `${fallbackPrefix}: ${parsed.detail}. ${validationSummary}`
      : `${fallbackPrefix}: ${parsed.detail}`
  }

  if (parsed.errorCode) {
    const messageKey = ERROR_CODE_TO_MESSAGE_KEY[parsed.errorCode]
    if (messageKey && t) {
      return `${fallbackPrefix}: ${t(messageKey)}`
    }
  }

  return `${fallbackPrefix}: ${parsed.detail}`
}
