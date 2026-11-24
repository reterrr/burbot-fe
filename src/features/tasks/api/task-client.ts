import { sameOriginApiClient } from '../../../api/client.ts'
import { formatApiError } from '../../../lib/api-error.ts'
import type {
  InboxFilters,
  InboxPage,
  MonitoringReview,
  Page,
  Task,
  TaskDetail,
  TaskStatus,
  Workflow,
} from './contracts.ts'

export class TaskApiError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'TaskApiError'
    this.statusCode = statusCode
  }
}

export function positiveId(value: unknown): string | undefined {
  const text =
    typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : ''
  return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text))
    ? text
    : undefined
}

function requireId(value: unknown): string {
  const id = positiveId(value)
  if (!id) throw new TaskApiError(422, 'Enter a positive integer ID.')
  return id
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data, status } = await sameOriginApiClient<{
    data: unknown
    status: number
  }>(`/backend${path}`, { credentials: 'same-origin', ...options })
  if (status >= 200 && status < 300) {
    if (typeof data === 'string' || data == null)
      throw new TaskApiError(
        502,
        'The Task API returned an unexpected response.',
      )
    return data as T
  }
  const fallback =
    status === 404
      ? 'The record could not be found.'
      : `The API returned status ${status}.`
  throw new TaskApiError(status, formatApiError(data, fallback))
}

interface Paging {
  offset: number
  limit: number
}

const pageQuery = ({ offset, limit }: Paging) =>
  new URLSearchParams({ offset: String(offset), limit: String(limit) })

export const taskClient = {
  async inbox(paging: Paging, filters: InboxFilters, signal?: AbortSignal) {
    const query = pageQuery(paging)
    for (const [name, value] of Object.entries(filters)) query.set(name, value)
    const page = await request<InboxPage>(`/tasks/inbox?${query}`, { signal })
    if (
      Object.entries(filters).some(
        ([name, value]) => String(page.applied_filters?.[name]) !== value,
      )
    )
      throw new TaskApiError(
        501,
        'This backend does not support the selected Inbox filters.',
      )
    return page
  },
  async count(signal?: AbortSignal) {
    const count = await request<number>('/tasks/inbox/count', { signal })
    if (!Number.isSafeInteger(count) || count < 0)
      throw new TaskApiError(
        502,
        'The Inbox count must be a non-negative integer.',
      )
    return count
  },
  task: (id: unknown, signal?: AbortSignal) =>
    request<TaskDetail>(`/tasks/${requireId(id)}`, { signal }),
  setStatus: (id: unknown, status: TaskStatus) =>
    request<TaskDetail>(`/tasks/${requireId(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  workflows: (sourceId: unknown, paging: Paging, signal?: AbortSignal) =>
    request<Page<Workflow>>(
      `/tasks/sources/${requireId(sourceId)}/workflows?${pageQuery(paging)}`,
      { signal },
    ),
  workflow: (id: unknown, signal?: AbortSignal) =>
    request<Workflow>(`/tasks/workflows/${requireId(id)}`, { signal }),
  workflowTasks: (id: unknown, paging: Paging, signal?: AbortSignal) =>
    request<Page<Task>>(
      `/tasks/workflows/${requireId(id)}/tasks?${pageQuery(paging)}`,
      { signal },
    ),
  review: (id: unknown, signal?: AbortSignal) =>
    request<MonitoringReview>(`/monitoring/reviews/${requireId(id)}`, {
      signal,
      cache: 'no-store',
    }),
}
