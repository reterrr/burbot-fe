import type {
  MonitoringReview,
  Page,
  TaskStatus,
  WorkflowStatus,
} from '../tasks/api/contracts'
import type { ReviewSnapshot } from '../tasks/api/review-contracts'
import { requestBackend } from '../tasks/api/task-client'

export const monitoringQueryKey = ['monitoring-workspace'] as const

export const fieldStatuses = {
  FIELD_NEW: {
    evidence: 'INITIAL_EVIDENCE',
    title: 'Initial evidence',
    color: 'blue',
  },
  FIELD_UNCHANGED: {
    evidence: 'UNCHANGED',
    title: 'Unchanged',
    color: 'default',
  },
  FIELD_CHANGED: { evidence: 'CHANGED', title: 'Value changed', color: 'gold' },
  FIELD_MISSING: {
    evidence: 'MISSING',
    title: 'Value missing',
    color: 'orange',
  },
  FIELD_AMBIGUOUS: {
    evidence: 'AMBIGUOUS',
    title: 'Ambiguous result',
    color: 'purple',
  },
  FIELD_CONFLICT: {
    evidence: 'CONFLICT',
    title: 'Conflicting evidence',
    color: 'red',
  },
  FIELD_EXTRACTION_FAILED: {
    evidence: 'EXTRACTION_FAILED',
    title: 'Extraction failed',
    color: 'red',
  },
} as const

export const issueLabels = {
  changed: 'Value changed',
  missing: 'Value missing',
  extraction_failed: 'Extraction failed',
  initial: 'Initial evidence',
  ambiguous: 'Ambiguous result',
  conflict: 'Conflicting evidence',
  source_changed: 'Website changed',
  job_failed: 'Check failed',
  open_tasks: 'Open tasks',
} as const

export const attentionReasons = {
  job_failed: 'Latest check failed',
  field_problems: 'Fields need investigation',
  open_tasks: 'Monitoring tasks are open',
  source_changed_incomplete_coverage:
    'Website changed with incomplete field coverage',
  source_changed_fields_unchanged: 'Website changed · Checked fields unchanged',
  source_changed: 'Website changed',
} as const

export type Issue = keyof typeof issueLabels
export type Sort = 'priority' | 'last_checked'
type ChangeStatus =
  | 'INITIAL_FETCH'
  | 'UNCHANGED'
  | 'CONTENT_CHANGED'
  | 'STRUCTURE_CHANGED'
  | 'CONTENT_AND_STRUCTURE_CHANGED'

export interface Check {
  id: string
  status: 'completed' | 'failed'
  checkedAt: string
  changeStatus: ChangeStatus | null
  snapshotId: number | null
  errorCode: string | null
}

export interface Source {
  id: number
  url: string | null
  name: string | null
  state: string
}

export interface AttentionSource extends Source {
  lastCheck: Check | null
  counts: Record<
    | 'problems'
    | 'changed'
    | 'missing'
    | 'extractionFailed'
    | 'initial'
    | 'unchanged'
    | 'ambiguous'
    | 'conflict',
    number
  >
  openTaskCount: number
  severity: 'high' | 'normal' | 'informational'
  reason: keyof typeof attentionReasons | null
}

export interface MonitoringTask {
  id: number
  title: string | null
  status: TaskStatus
  workflowStatus: WorkflowStatus
  originCheckId: string
  snapshotId: number | null
  checkedAt: string | null
  requiresReview: boolean
}

export interface TrackedField {
  selectorUuid: string
  selectorVersionId: number | null
  selectorVersionUuid: string | null
  configured: boolean
  businessField: { id: number; name: string | null }
  businessObjectFieldId: number | null
  businessObject: { id: number; name: string | null } | null
  status: keyof typeof fieldStatuses | null
  canonicalValueId: number | null
  canonicalValue: unknown
  previousEvidence: MonitoringReview['previousEvidence']
  currentEvidence: MonitoringReview['currentEvidence']
  previousObservationId: number | null
  observationId: number | null
  evaluationId: number | null
  task: MonitoringTask | null
}

export interface SourceReview {
  id: number
  source: Source
  latestCheck: Check | null
  latestCompletedCheck: Check | null
  selectedCheck: Check | null
  snapshot: ReviewSnapshot | null
  fields: TrackedField[]
  earlierTasks: Page<MonitoringTask>
}

type FieldInspection = Pick<
  MonitoringReview,
  'selector' | 'evaluation' | 'extractionRunId'
>
const read = <T>(path: string, signal?: AbortSignal) =>
  requestBackend<T>(path, { signal, cache: 'no-store' })

export const monitoringApi = {
  attention: (
    params: {
      search: string
      issue: Issue | ''
      sort: Sort
      includeAll: boolean
      offset: number
      limit: number
    },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      search: params.search,
      sort: params.sort,
      includeAll: String(params.includeAll),
      offset: String(params.offset),
      limit: String(params.limit),
    })
    if (params.issue) query.set('issue', params.issue)
    return read<Page<AttentionSource>>(
      '/monitoring/attention/sources?' + query,
      signal,
    )
  },
  source: (
    id: string,
    checkId: string | null,
    offset: number,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      tasksOffset: String(offset),
      tasksLimit: '20',
    })
    if (checkId) query.set('checkId', checkId)
    return read<SourceReview>(
      `/monitoring/sources/${id}/review?${query}`,
      signal,
    )
  },
  history: (id: string, offset: number, limit: number, signal?: AbortSignal) =>
    read<Check[]>(
      `/monitoring/sources/${id}/history?summary=true&offset=${offset}&limit=${limit}`,
      signal,
    ),
  field: (
    id: number,
    checkId: string,
    selectorUuid: string,
    signal?: AbortSignal,
  ) =>
    read<FieldInspection>(
      `/monitoring/sources/${id}/review/${encodeURIComponent(checkId)}/${encodeURIComponent(selectorUuid)}`,
      signal,
    ),
}
