import type { HTTPValidationError } from '../api/models'

export function formatApiError(data: unknown, fallback: string): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'detail' in data &&
    Array.isArray((data as HTTPValidationError).detail)
  ) {
    const details = (data as HTTPValidationError).detail ?? []
    if (details.length > 0) {
      return details
        .map((detail) => {
          const path = detail.loc?.join('.')
          return path ? `${path}: ${detail.msg}` : detail.msg
        })
        .join('\n')
    }
  }

  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string'
  ) {
    return data.message
  }

  return fallback
}
