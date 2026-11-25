import type {
  ReviewSnapshot,
  ReviewSource,
} from '../tasks/api/review-contracts'
import { TaskApiError } from '../tasks/api/task-client'

export interface SnapshotDetails {
  source: ReviewSource
  snapshot: ReviewSnapshot
  artifact: {
    mimeType: string
    sizeBytes: number | null
    sha256: string | null
  } | null
}

interface SnapshotContent extends SnapshotDetails {
  html: string | null
}

const errorMessages: Record<string, string> = {
  SNAPSHOT_NOT_FOUND: 'This snapshot is unavailable for the selected source.',
  SNAPSHOT_ARTIFACT_NOT_FOUND: 'The stored HTML file is unavailable.',
  SNAPSHOT_TOO_LARGE: 'The HTML file exceeds the 5 MiB snapshot limit.',
  SNAPSHOT_INTEGRITY_MISMATCH: 'The stored HTML failed its integrity check.',
  SNAPSHOT_NOT_HTML: 'The stored file has a different content type.',
  STORAGE_NOT_CONFIGURED: 'Snapshot storage is unavailable.',
  STORAGE_UNAVAILABLE: 'Snapshot storage is unavailable.',
}

export function snapshotPath(
  sourceId: string | number,
  snapshotId: string | number,
) {
  return `/monitoring/sources/${sourceId}/snapshots/${snapshotId}`
}

async function requestSnapshot(
  path: string,
  mediaType: string,
  signal?: AbortSignal,
) {
  const response = await fetch(`/backend${path}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    signal,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const code: unknown = body?.detail?.code
    const message =
      typeof code === 'string' && Object.hasOwn(errorMessages, code)
        ? errorMessages[code]
        : response.status === 401 || response.status === 403
          ? 'The monitoring operator credential was rejected.'
          : `The snapshot request returned status ${response.status}.`
    throw new TaskApiError(response.status, message)
  }
  if (response.headers.get('content-type')?.split(';', 1)[0] !== mediaType)
    throw new TaskApiError(
      502,
      'The snapshot API returned an unexpected content type.',
    )
  return response
}

async function readContent(
  sourceId: string,
  snapshotId: string,
  metadataOnly: boolean,
  signal?: AbortSignal,
) {
  const path = `${snapshotPath(sourceId, snapshotId)}/content${metadataOnly ? '?metadataOnly=true' : ''}`
  const response = await requestSnapshot(path, 'application/json', signal)
  const data: SnapshotContent = await response.json()
  if (
    data?.snapshot?.id !== Number(snapshotId) ||
    data.snapshot.source_id !== Number(sourceId) ||
    data.source?.id !== Number(sourceId)
  )
    throw new TaskApiError(
      502,
      'The snapshot API returned an unexpected capture.',
    )
  return data
}

export const snapshotApi = {
  details: (
    sourceId: string,
    snapshotId: string,
    signal?: AbortSignal,
  ): Promise<SnapshotDetails> =>
    readContent(sourceId, snapshotId, true, signal),
  async preview(sourceId: string, snapshotId: string, signal?: AbortSignal) {
    const response = await requestSnapshot(
      `${snapshotPath(sourceId, snapshotId)}/preview`,
      'text/html',
      signal,
    )
    return response.text()
  },
  async html(sourceId: string, snapshotId: string, signal?: AbortSignal) {
    const data = await readContent(sourceId, snapshotId, false, signal)
    if (typeof data.html !== 'string')
      throw new TaskApiError(502, 'The snapshot API returned no HTML source.')
    return data.html
  },
  async download(sourceId: string, snapshotId: string) {
    const response = await requestSnapshot(
      `${snapshotPath(sourceId, snapshotId)}/download`,
      'application/octet-stream',
    )
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `snapshot-${snapshotId}.html`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
