import type { MonitoringReview } from '../tasks/api/contracts'
import { TaskApiError } from '../tasks/api/task-client'

export interface SnapshotSelectorContext {
  extractionRunId: number
  selectorUuid: string
  selectorVersionUuid: string
}

export function snapshotSelectorContext({
  selector,
  extractionRunId,
}: Pick<
  MonitoringReview,
  'selector' | 'extractionRunId'
>): SnapshotSelectorContext | undefined {
  if (!selector || extractionRunId == null) return undefined
  return {
    extractionRunId,
    selectorUuid: selector.identity.uuid,
    selectorVersionUuid: selector.version.uuid,
  }
}

export interface SnapshotOpenRequest {
  requestId: string
  sourceId: number
  snapshotId: number
  checkId?: string
  targetAgentId?: string
  selectorContext?: SnapshotSelectorContext
}

export interface SnapshotAgent {
  agentId: string
  name: string
}

export interface SnapshotCommand {
  commandId: string
  state: 'pending' | 'claimed' | 'opened' | 'failed' | 'expired'
  expiresAt: string
  errorCode: string | null
}

const errorMessages: Record<string, string> = {
  SNAPSHOT_NOT_FOUND: 'This snapshot is unavailable for the selected source.',
  SNAPSHOT_ARTIFACT_NOT_FOUND: 'The stored HTML file is unavailable.',
  SNAPSHOT_ARCHIVE_UNAVAILABLE: 'Firefox could not read the stored visual archive.',
  SNAPSHOT_CHECK_MISMATCH: 'The selected monitoring check belongs to a different capture.',
  SNAPSHOT_TOO_LARGE: 'The HTML file exceeds the 5 MiB snapshot limit.',
  SNAPSHOT_INTEGRITY_MISMATCH: 'The stored HTML failed its integrity check.',
  SNAPSHOT_NOT_HTML: 'The stored file has a different content type.',
  STORAGE_NOT_CONFIGURED: 'Snapshot storage is unavailable.',
  STORAGE_UNAVAILABLE: 'Snapshot storage is unavailable.',
  SNAPSHOT_DIGEST_UNAVAILABLE: 'This capture has no stored integrity digest.',
  SNAPSHOT_AGENT_OFFLINE:
    'No eligible Firefox agent is connected for this source.',
  SNAPSHOT_AGENT_REQUIRED:
    'Choose the Firefox agent that should open this capture.',
  SNAPSHOT_SOURCE_FORBIDDEN:
    'This Firefox agent no longer has access to the source.',
  SNAPSHOT_SELECTOR_CONTEXT_INVALID:
    'The recorded selector is unavailable for this capture.',
  SNAPSHOT_UNAVAILABLE: 'Firefox could not retrieve the archived capture.',
  BACKEND_TIMEOUT: 'Firefox timed out while retrieving the archived capture.',
  INVALID_ARTIFACT: 'Firefox received an invalid HTML artifact.',
  VIEWER_OPEN_FAILED: 'Firefox could not open the snapshot tab.',
  VIEWER_INTERRUPTED: 'Firefox was interrupted while opening the snapshot.',
}

export function snapshotCommandError(code: string | null) {
  return (
    (code && Object.hasOwn(errorMessages, code)
      ? errorMessages[code]
      : undefined) ?? 'Firefox could not open the snapshot.'
  )
}

const commandsPath = '/monitoring/snapshots/open-commands'
const requestTimeout = 12_000

async function commandJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(requestTimeout)
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout
  try {
    const response = await fetch(`/backend${path}`, {
      ...options,
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      signal,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => {
        signal.throwIfAborted()
        return null
      })
      const code: unknown = body?.detail?.code
      const message =
        typeof code === 'string' && Object.hasOwn(errorMessages, code)
          ? errorMessages[code]
          : response.status === 401 || response.status === 403
            ? 'The monitoring operator credential was rejected.'
            : `The snapshot request returned status ${response.status}.`
      throw new TaskApiError(response.status, message)
    }
    if (
      response.headers.get('content-type')?.split(';', 1)[0] !==
      'application/json'
    )
      throw new TaskApiError(
        502,
        'The snapshot API returned an unexpected content type.',
      )
    return (await response.json()) as T
  } catch (error) {
    if (timeout.aborted && !options.signal?.aborted)
      throw new Error('The snapshot request timed out. Try again.')
    throw error
  }
}

export const snapshotBridge = {
  agents: (sourceId: number) =>
    commandJson<SnapshotAgent[]>(
      `/monitoring/sources/${sourceId}/snapshot-agents`,
    ),
  open: (request: SnapshotOpenRequest) =>
    commandJson<SnapshotCommand>(commandsPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open_snapshot', ...request }),
    }),
  status: (id: string, signal?: AbortSignal) =>
    commandJson<SnapshotCommand>(
      `${commandsPath}/${encodeURIComponent(id)}`,
      { signal },
    ),
}
