import { Alert, Card, Descriptions, Tag } from 'antd'
import { Link, useLocation, useParams } from 'react-router'
import { localReviewEnabled } from '../../../app/studio'
import { TechnicalId } from '../../monitoring/BusinessValue'
import { businessFieldType } from '../../monitoring/business-values'
import { sourceTitle } from '../../monitoring/presentation'
import type {
  EvidenceStatus,
  MonitoringReview,
  TaskDetail,
} from '../api/contracts'
import { positiveId } from '../api/task-client'
import { EvidenceValues } from '../components/EvidenceValues'
import { ReviewInspection } from '../components/ReviewInspection'
import { TaskActions } from '../components/TaskActions'
import {
  RequestFailure,
  StatusTag,
  TaskHeader,
  TaskLoading,
  TaskReferences,
} from '../components/TaskPresentation'
import { useTask, useTaskReview } from '../hooks/task-queries'
import { label, titleOf } from '../presentation'

const evidenceLabels: Record<EvidenceStatus, { title: string; color: string }> =
  {
    INITIAL_EVIDENCE: { title: 'Initial evidence', color: 'blue' },
    UNCHANGED: { title: 'Unchanged evidence', color: 'default' },
    CHANGED: { title: 'Changed evidence', color: 'gold' },
    MISSING: { title: 'Missing evidence', color: 'orange' },
    AMBIGUOUS: { title: 'Ambiguous evidence', color: 'purple' },
    CONFLICT: { title: 'Conflicting evidence', color: 'red' },
    EXTRACTION_FAILED: { title: 'Extraction failure', color: 'red' },
  }

function EvidenceComparison({
  review,
  task,
}: {
  review: MonitoringReview
  task: TaskDetail
}) {
  const status = review.evidenceStatus
    ? evidenceLabels[review.evidenceStatus]
    : undefined
  const sourceId =
    review.source?.id ??
    task.references.find((reference) => reference.reference_type === 'source')
      ?.reference_id
  const field = review.businessField
  const fieldId =
    field?.id ??
    task.references.find(
      (reference) => reference.reference_type === 'business_field',
    )?.reference_id
  const fieldType = field && businessFieldType(field)
  const slot =
    review.businessObjectFieldId ??
    task.references.find(
      (reference) => reference.reference_type === 'business_object_field',
    )?.reference_id

  return (
    <div
      className="task-stack task-evidence-comparison"
      data-testid="evidence-comparison"
    >
      <Card
        title="Evidence context"
        size="small"
        extra={status && <Tag color={status.color}>{status.title}</Tag>}
      >
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2 }}
          items={[
            ...(sourceId != null
              ? [
                  {
                    key: 'source',
                    label: 'Source',
                    children: (
                      <div className="task-display-stack">
                        {review.source &&
                          (review.source.name || review.source.url) && (
                            <Link to={`/monitoring/sources/${sourceId}`}>
                              {sourceTitle(review.source)}
                            </Link>
                          )}
                        <TechnicalId name="Source" id={sourceId} copy />
                      </div>
                    ),
                  },
                ]
              : []),
            ...(fieldId != null
              ? [
                  {
                    key: 'field',
                    label: 'Business field',
                    children: (
                      <div className="task-display-stack">
                        {field?.name && <strong>{field.name}</strong>}
                        {fieldType && <span>{fieldType}</span>}
                        <div className="task-value-detail">
                          {field?.persistentKey && (
                            <span>{field.persistentKey} ·</span>
                          )}
                          <TechnicalId name="Field" id={fieldId} copy />
                        </div>
                      </div>
                    ),
                  },
                ]
              : []),
            ...(slot != null
              ? [
                  {
                    key: 'slot',
                    label: 'Business object field',
                    children: (
                      <div className="task-display-stack">
                        {field?.name && <strong>{field.name}</strong>}
                        {review.businessObject?.name && (
                          <span>{review.businessObject.name}</span>
                        )}
                        <TechnicalId name="Slot" id={slot} copy />
                      </div>
                    ),
                  },
                ]
              : []),
            {
              key: 'comparison',
              label: 'Compared against',
              children: review.comparison ? label(review.comparison) : '—',
            },
            {
              key: 'evaluation',
              label: 'Evaluation',
              children: review.evaluationId ? `#${review.evaluationId}` : '—',
            },
            {
              key: 'baseline',
              label: 'Baseline observation',
              children: review.baselineObservationId
                ? `#${review.baselineObservationId}`
                : '—',
            },
            {
              key: 'required',
              label: 'Review',
              children: review.requiresReview ? 'Required' : 'Resolved',
            },
          ]}
        />
      </Card>
      <EvidenceValues review={review} />
      <ReviewInspection review={review} />
    </div>
  )
}

export default function ReviewPage() {
  const { id } = useParams()
  const { state } = useLocation()
  const { query: taskQuery, result: task } = useTask(id)
  const validId = positiveId(id)
  const { query, result: review } = useTaskReview(id, Boolean(task))

  if (taskQuery.isLoading) return <TaskLoading />
  if (!task || taskQuery.isError)
    return (
      <div className="task-page">
        <TaskHeader
          title="Evidence review"
          back={{ to: '/tasks', label: 'Task inbox' }}
        />
        <RequestFailure
          message={validId ? 'Could not load this task' : 'Invalid task ID'}
          error={taskQuery.error}
          retry={validId ? () => void taskQuery.refetch() : undefined}
        />
      </div>
    )

  return (
    <div className="task-page">
      <TaskHeader
        title="Evidence review"
        back={{ to: `/tasks/${task.id}`, label: `Task #${task.id}`, state }}
        subtitle={
          <>
            <span>{titleOf(task)}</span>
            <StatusTag status={task.status} />
          </>
        }
        actions={<TaskActions task={task} />}
      />
      <div className="task-detail-grid">
        <div className="task-stack">
          {!localReviewEnabled && (
            <Alert
              type="info"
              showIcon
              message="Evidence review needs a local operator token"
              description={
                <>
                  Set <code>MONITORING_ADMIN_TOKEN</code> in the Vite server
                  environment and restart the local Studio.
                </>
              }
            />
          )}
          {localReviewEnabled &&
            (query.isLoading ? (
              <TaskLoading />
            ) : query.error?.statusCode === 404 ? (
              <Alert
                type="info"
                showIcon
                message="No field-level evidence comparison is available for this task"
              />
            ) : query.error ? (
              <RequestFailure
                message={
                  query.error.statusCode === 401 ||
                  query.error.statusCode === 403
                    ? 'FastAPI rejected the local operator token'
                    : 'Could not load monitoring evidence'
                }
                error={query.error}
                retry={() => void query.refetch()}
              />
            ) : (
              review && <EvidenceComparison review={review} task={task} />
            ))}
        </div>
        <TaskReferences references={task.references} review={review} />
      </div>
    </div>
  )
}
