import { useQuery } from '@tanstack/react-query'
import { Drawer, Space, Tag, Typography } from 'antd'
import { Link } from 'react-router'
import { EvidenceValues } from '../tasks/components/EvidenceValues'
import { ReviewInspection } from '../tasks/components/ReviewInspection'
import {
  RecordId,
  RequestFailure,
  StatusTag,
  TaskLoading,
} from '../tasks/components/TaskPresentation'
import type { SourceReview, TrackedField } from './api'
import { fieldStatuses, monitoringApi, monitoringQueryKey } from './api'
import { businessFieldTitle, businessFieldType } from './presentation'
import type { SnapshotBack } from './SnapshotLink'
import { FieldTag } from './StatusTags'

export default function FieldInspector({
  field,
  review,
  onClose,
  snapshotBack,
}: {
  field: TrackedField
  review: Pick<SourceReview, 'id' | 'source' | 'snapshot' | 'selectedCheck'>
  onClose: () => void
  snapshotBack?: SnapshotBack
}) {
  const checkId = review.selectedCheck?.id
  const fieldType = businessFieldType(field.businessField)
  const recorded = Boolean(checkId && field.status)
  const inspection = useQuery({
    queryKey: [
      ...monitoringQueryKey,
      'field',
      review.id,
      checkId,
      field.selectorUuid,
    ],
    queryFn: () => monitoringApi.field(review.id, checkId!, field.selectorUuid),
    enabled: recorded,
  })
  return (
    <Drawer
      title={businessFieldTitle(field.businessField)}
      width="min(100vw, 850px)"
      open
      onClose={onClose}
      className="task-review-inspector"
    >
      <div className="task-stack">
        <div className="task-value-meta">
          {field.businessField.persistentKey && (
            <span>{field.businessField.persistentKey} ·</span>
          )}
          <RecordId id={field.businessField.id} prefix="Field" />
          {fieldType && <span>{fieldType}</span>}
          {field.businessObjectFieldId != null && (
            <RecordId id={field.businessObjectFieldId} prefix="Slot" />
          )}
        </div>
        <Space wrap>
          {field.businessObject && (
            <>
              {field.businessObject.name && (
                <Typography.Text>{field.businessObject.name}</Typography.Text>
              )}
              <RecordId id={field.businessObject.id} prefix="BusinessObject" />
            </>
          )}
          <FieldTag status={field.status} />
          {field.task && (
            <>
              <Link to={`/tasks/${field.task.id}`}>
                Open task #{field.task.id}
              </Link>
              <StatusTag status={field.task.status} />
              {field.task.workflowStatus === 'superseded' && (
                <Tag>Superseded workflow</Tag>
              )}
              {field.task.originCheckId !== checkId && (
                <Tag>Task started in an earlier check</Tag>
              )}
            </>
          )}
        </Space>
        <EvidenceValues
          review={{
            ...field,
            evidenceStatus: field.status
              ? fieldStatuses[field.status].evidence
              : null,
            evidenceChanged: field.status === 'FIELD_CHANGED',
          }}
        />
        {recorded &&
          (inspection.isPending ? (
            <TaskLoading />
          ) : (
            inspection.isError && (
              <RequestFailure
                message="Could not load selector diagnostics"
                error={inspection.error}
                retry={() => void inspection.refetch()}
              />
            )
          ))}
        {(!recorded || !inspection.isPending) && (
          <ReviewInspection
            sourceCheckId={checkId}
            snapshotBack={
              snapshotBack ?? {
                label: 'Field inspector',
                state: { inspectField: field.selectorUuid },
              }
            }
            review={{
              ...inspection.data,
              source: review.source,
              snapshot: review.snapshot,
            }}
          />
        )}
      </div>
    </Drawer>
  )
}
