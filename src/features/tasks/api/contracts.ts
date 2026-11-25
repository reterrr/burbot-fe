import type {
  ReviewEvaluation,
  ReviewSelector,
  ReviewSnapshot,
  ReviewSource,
} from './review-contracts'
import type {
  BusinessEntityDisplay,
  BusinessFieldDisplay,
  CanonicalValueContext,
} from '../../monitoring/business-values'

export const taskTypes = [
  'discover_source',
  'review_source_change',
  'resolve_observation',
  'review_business_object',
] as const

export const taskReasons = [
  'source_registered',
  'source_changed',
  'value_changed',
  'value_missing',
  'value_conflict',
  'possible_new_object',
  'object_missing',
  'extraction_failed',
  'manual',
] as const

export const inboxStatuses = ['pending', 'in_progress'] as const
export const taskStatuses = [
  ...inboxStatuses,
  'completed',
  'failed',
  'cancelled',
] as const

export type TaskStatus = (typeof taskStatuses)[number]
export type WorkflowStatus =
  'active' | 'completed' | 'superseded' | 'failed' | 'cancelled'
export type TaskType = (typeof taskTypes)[number]
export type TaskReason = (typeof taskReasons)[number]

export interface Task {
  id: number
  workflow_id: number
  type: TaskType
  reason: TaskReason | null
  status: TaskStatus
  title: string | null
  description: string | null
  metadata_json: Record<string, unknown> | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface TaskReference {
  id: number
  task_id: number
  role: 'target' | 'context' | 'caused_by'
  reference_type:
    | 'source'
    | 'source_snapshot'
    | 'extraction_run'
    | 'observation'
    | 'business_entity'
    | 'business_object'
    | 'business_field'
    | 'business_object_field'
  reference_id: number
  metadata_json: Record<string, unknown> | null
  created_at: string
}

export interface TaskDetail extends Task {
  references: TaskReference[]
  allowed_statuses?: TaskStatus[]
}

export interface TaskReferenceDisplay {
  label?: string | null
  capturedAt?: string | null
  status?: string | null
}

export interface InboxContext {
  source_id: number
  source_snapshot_id: number
  workflow_key: string
  allowed_statuses?: TaskStatus[]
}

export interface InboxItem extends InboxContext {
  task: Task
}

export type InboxTask = InboxContext & Task

export interface InboxFilters {
  status?: (typeof inboxStatuses)[number]
  type?: TaskType
  reason?: TaskReason
  source_id?: string
  task_id?: string
}

export interface Page<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

export interface InboxPage extends Page<InboxItem> {
  applied_filters?: Record<string, string | number>
}

export interface Workflow {
  id: number
  key: string
  source_id: number
  source_snapshot_id: number
  previous_workflow_id: number | null
  status: WorkflowStatus
  created_at: string
  completed_at: string | null
  superseded_at: string | null
  metadata_json: Record<string, unknown> | null
}

export type EvidenceStatus =
  | 'INITIAL_EVIDENCE'
  | 'UNCHANGED'
  | 'CHANGED'
  | 'MISSING'
  | 'AMBIGUOUS'
  | 'CONFLICT'
  | 'EXTRACTION_FAILED'

export interface MonitoringReview extends CanonicalValueContext {
  taskId: number
  taskStatus: TaskStatus
  businessObjectFieldId: number | null
  businessField?: BusinessFieldDisplay | null
  businessObject?: BusinessEntityDisplay | null
  referenceDisplays?: Record<number, TaskReferenceDisplay>
  previousObservationId: number | null
  observationId: number | null
  previousEvidence: string | string[] | null
  currentEvidence: string | string[] | null
  evaluationId: number | null
  selector?: ReviewSelector | null
  evaluation?: ReviewEvaluation | null
  source?: ReviewSource | null
  snapshot?: ReviewSnapshot | null
  extractionRunId?: number | null
  baselineObservationId: number | null
  comparison: 'accepted_baseline' | 'previous_observation' | null
  evidenceStatus: EvidenceStatus | null
  evidenceChanged: boolean | null
  requiresReview: boolean
}
