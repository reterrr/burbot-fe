import { useOne } from '@refinedev/core'
import { Alert, Card, Descriptions, Tag, Typography } from 'antd'
import { ArrowRight } from 'lucide-react'
import { useLocation, useParams } from 'react-router'
import { localReviewEnabled } from '../../../app/studio'
import type {
  EvidenceStatus,
  MonitoringReview,
  TaskDetail,
} from '../api/contracts'
import { positiveId } from '../api/task-client'
import type { TaskApiError } from '../api/task-client'
import { taskResources } from '../api/task-provider'
import { TaskActions } from '../components/TaskActions'
import {
  JsonValue,
  RequestFailure,
  StatusTag,
  TaskHeader,
  TaskLoading,
  TaskReferences,
} from '../components/TaskPresentation'
import { useTask } from '../hooks/task-queries'
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

function EvidenceText({
  value,
}: {
  value: MonitoringReview['currentEvidence']
}) {
  if (value == null || (Array.isArray(value) && value.length === 0))
    return (
      <Typography.Text type="secondary">No evidence recorded</Typography.Text>
    )
  if (Array.isArray(value))
    return (
      <ol className="task-evidence-values">
        {value.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ol>
    )
  return <div className="task-evidence-text">{value || <i>Empty text</i>}</div>
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
  const source = task.references.find(
    (reference) => reference.reference_type === 'source',
  )
  const field = task.references.find(
    (reference) => reference.reference_type === 'business_field',
  )
  const slot =
    review.businessObjectFieldId ??
    task.references.find(
      (reference) => reference.reference_type === 'business_object_field',
    )?.reference_id

  return (
    <div className="task-stack" data-testid="evidence-comparison">
      <Card
        title="Evidence context"
        size="small"
        extra={status && <Tag color={status.color}>{status.title}</Tag>}
      >
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2 }}
          items={[
            ...(source
              ? [
                  {
                    key: 'source',
                    label: 'Source',
                    children: `#${source.reference_id}`,
                  },
                ]
              : []),
            ...(field
              ? [
                  {
                    key: 'field',
                    label: 'Business field',
                    children: `#${field.reference_id}`,
                  },
                ]
              : []),
            ...(slot
              ? [
                  {
                    key: 'slot',
                    label: 'Business object field',
                    children: `#${slot}`,
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
      {review.evidenceStatus === 'EXTRACTION_FAILED' && (
        <Alert
          type="error"
          showIcon
          message="Extraction failed"
          description="See the evaluation and extraction run references for this task."
        />
      )}
      <Card
        title="Canonical value"
        size="small"
        extra={
          review.canonicalValueId && (
            <span className="task-mono">#{review.canonicalValueId}</span>
          )
        }
      >
        {review.canonicalValueId != null || review.canonicalValue != null ? (
          <JsonValue value={review.canonicalValue} />
        ) : (
          <Typography.Text type="secondary">No canonical value</Typography.Text>
        )}
      </Card>
      <div
        className={`task-evidence-grid${review.evidenceChanged ? ' is-changed' : ''}`}
      >
        <Card
          title="Previous evidence"
          size="small"
          extra={
            review.previousObservationId && (
              <span className="task-mono">#{review.previousObservationId}</span>
            )
          }
        >
          <EvidenceText value={review.previousEvidence} />
        </Card>
        <ArrowRight size={17} aria-hidden className="task-evidence-arrow" />
        <Card
          title="Current evidence"
          size="small"
          extra={
            review.observationId && (
              <span className="task-mono">#{review.observationId}</span>
            )
          }
        >
          <EvidenceText value={review.currentEvidence} />
        </Card>
      </div>
    </div>
  )
}

export default function ReviewPage() {
  const { id } = useParams()
  const { state } = useLocation()
  const { query: taskQuery, result: task } = useTask(id)
  const validId = positiveId(id)
  const { query, result: review } = useOne<MonitoringReview, TaskApiError>({
    resource: taskResources.reviews,
    id: validId,
    errorNotification: false,
    queryOptions: {
      enabled: Boolean(validId && task && localReviewEnabled),
    },
  })

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
        <TaskReferences references={task.references} />
      </div>
    </div>
  )
}
