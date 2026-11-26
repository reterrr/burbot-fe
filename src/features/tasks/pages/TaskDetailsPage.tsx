import { Card, Descriptions, Tag, Typography } from 'antd'
import { Link, useLocation, useParams } from 'react-router'
import { localReviewEnabled } from '../../../app/studio'
import { SnapshotLink } from '../../monitoring/SnapshotLink'
import { snapshotSelectorContext } from '../../monitoring/snapshot-api'
import { positiveId } from '../api/task-client'
import { TaskActions } from '../components/TaskActions'
import {
  JsonValue,
  RequestFailure,
  StatusTag,
  TaskHeader,
  TaskLoading,
  TaskReferences,
  Timestamp,
} from '../components/TaskPresentation'
import {
  useMonitoringReview,
  useTask,
  useTaskBackLink,
} from '../hooks/task-queries'
import { hasReview, label, titleOf } from '../presentation'

export default function TaskDetailsPage() {
  const { id } = useParams()
  const { state } = useLocation()
  const back = useTaskBackLink()
  const { query, result: task } = useTask(id)
  const hasMonitoringJob = Boolean(task?.metadata_json?.monitoringJobId)
  const { query: reviewQuery, result: review } = useMonitoringReview(
    id,
    hasMonitoringJob,
  )
  if (query.isLoading) return <TaskLoading />
  if (!task || query.isError)
    return (
      <div className="task-page">
        <TaskHeader title="Task details" back={back} />
        <RequestFailure
          message={
            positiveId(id) ? 'Could not load this task' : 'Invalid task ID'
          }
          error={query.error}
          retry={positiveId(id) ? () => void query.refetch() : undefined}
        />
      </div>
    )
  const source = task.references.find(
    (reference) => reference.reference_type === 'source',
  )
  const objectTarget = task.references.find(
    (reference) =>
      reference.reference_type === 'business_object' &&
      reference.role === 'target',
  )
  const objectId = objectTarget?.reference_id ?? review?.businessObject?.id
  const snapshotSourceId = review?.snapshot?.source_id ?? source?.reference_id
  const snapshotId =
    review?.snapshot?.id ??
    task.references.find(
      (reference) => reference.reference_type === 'source_snapshot',
    )?.reference_id
  const historyQuery = new URLSearchParams({
    workflow: String(task.workflow_id),
  })
  if (source) historyQuery.set('source', String(source.reference_id))

  return (
    <div className="task-page">
      <TaskHeader
        title={titleOf(task)}
        back={back}
        subtitle={
          <>
            <span className="task-mono">Task #{task.id}</span>
            <StatusTag status={task.status} />
          </>
        }
        actions={<TaskActions task={task} />}
      />
      <div className="task-detail-grid">
        <div className="task-stack">
          <Card title="Task details" size="small">
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                { key: 'type', label: 'Type', children: label(task.type) },
                {
                  key: 'reason',
                  label: 'Reason',
                  children:
                    task.reason === 'manual' &&
                    (task.metadata_json?.monitoringJobId ||
                      task.metadata_json?.monitoringKey)
                      ? 'Monitoring review'
                      : task.reason
                        ? label(task.reason)
                        : '—',
                },
                {
                  key: 'workflow',
                  label: 'Workflow',
                  children: (
                    <Link to={`/tasks/history?${historyQuery}`}>
                      #{task.workflow_id}
                    </Link>
                  ),
                },
                ...(source
                  ? [
                      {
                        key: 'source',
                        label: 'Source',
                        children: (
                          <Link
                            to={`/monitoring/sources/${source.reference_id}`}
                          >
                            Open source review
                          </Link>
                        ),
                      },
                    ]
                  : []),
                ...(localReviewEnabled &&
                !(hasMonitoringJob && reviewQuery.isPending) &&
                snapshotSourceId != null &&
                snapshotId != null
                  ? [
                      {
                        key: 'snapshot',
                        label: 'Snapshot',
                        children: (
                          <SnapshotLink
                            sourceId={snapshotSourceId}
                            snapshotId={snapshotId}
                            selectorContext={
                              review?.snapshot
                                ? snapshotSelectorContext(review)
                                : undefined
                            }
                            small
                          />
                        ),
                      },
                    ]
                  : []),
                {
                  key: 'created',
                  label: 'Created',
                  children: <Timestamp value={task.created_at} />,
                },
                {
                  key: 'started',
                  label: 'Started',
                  children: <Timestamp value={task.started_at} />,
                },
                {
                  key: 'completed',
                  label: 'Completed',
                  children: <Timestamp value={task.completed_at} />,
                },
              ]}
            />
            {task.description && (
              <Typography.Paragraph className="task-description">
                {task.description}
              </Typography.Paragraph>
            )}
          </Card>
          {hasReview(task) && (
            <Card title="Monitoring evidence" size="small">
              <div className="task-review-link">
                {localReviewEnabled && objectId != null && (
                  <Link to={`/tasks/objects/${objectId}?task=${task.id}`}>
                    Open object review
                  </Link>
                )}
                {task.type !== 'review_business_object' && (
                  <Link to={`/tasks/${task.id}/review`} state={state}>
                    Open evidence review
                  </Link>
                )}
                {typeof task.metadata_json?.evidenceStatus === 'string' && (
                  <Tag>{label(task.metadata_json.evidenceStatus)}</Tag>
                )}
              </div>
            </Card>
          )}
          {task.metadata_json && (
            <Card title="Metadata" size="small">
              <JsonValue value={task.metadata_json} />
            </Card>
          )}
        </div>
        <TaskReferences references={task.references} review={review} />
      </div>
    </div>
  )
}
